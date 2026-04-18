import ffmpeg
import uvicorn
import os
import tempfile
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, validator
from typing import List, Any

# --- Pydantic Models for Request Validation ---
class ImageFile(BaseModel):
    path: str
    duration: float
    ffmpegCommand: str | None = None
    onScreenText: str | None = None

    @validator('ffmpegCommand', pre=True)
    def empty_dict_to_none(cls, v: Any) -> Any:
        """Catches an empty object {} from the frontend and converts it to None."""
        if isinstance(v, dict) and not v:
            return None
        return v

class RenderPayload(BaseModel):
    imageFiles: List[ImageFile]
    audioFile: str
    outputPath: str

# --- Initialize FastAPI App ---
app = FastAPI()

# --- Core FFMPEG Logic ---
def create_video(payload: RenderPayload):
    """
    Processes the payload and renders a video using ffmpeg-python.
    This function contains the core, corrected rendering logic.
    """
    print(f"Starting video creation for: {payload.outputPath}")

    if not all([payload.imageFiles, payload.audioFile, payload.outputPath]):
        raise ValueError("Missing imageFiles, audioFile, or outputPath in payload")

    # --- Input Streams ---
    # Create a single-frame input stream for each image. The looping and duration will be handled
    # by the 'loop' and 'trim' filters in the filter graph, which is more reliable.
    image_inputs = [ffmpeg.input(file.path) for file in payload.imageFiles]
    audio_input = ffmpeg.input(payload.audioFile)

    # --- Filter Graph ---
    # Let's build the filter graph string manually for clarity and robustness.
    filter_chains = []
    concat_inputs = []
    for i, file in enumerate(payload.imageFiles):
        # Calculate the number of frames required for the image's duration.
        num_frames = int(file.duration * 30) # Assuming 30 FPS

        # Use the provided ffmpegCommand or a default fade effect
        vf_command = file.ffmpegCommand if file.ffmpegCommand and file.ffmpegCommand.strip() else f"fade=in:st=0:d=0.5,fade=out:st={max(0, file.duration - 0.5)}:d=0.5"
        
        # Always ensure yuv420p format for compatibility, adding it if not present
        if 'format=yuv420p' not in vf_command:
            vf_command += ',format=yuv420p'

        # Build the filter chain for this image
        # 1. loop: Loop the single-frame image for the required number of frames.
        # 2. trim: Trim the looped stream to the exact duration.
        filter_chains.append(
            f"[{i}:v]loop=loop=-1:size={num_frames},trim=duration={file.duration},setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,{vf_command}[v{i}]"
        )
        concat_inputs.append(f"[v{i}]")

    concat_filter = f"{''.join(concat_inputs)}concat=n={len(payload.imageFiles)}:v=1:a=0[v]"
    filter_chains.append(concat_filter)
    
    final_filter_graph = ";".join(filter_chains)

    # Combine all inputs for the ffmpeg command
    all_inputs = image_inputs + [audio_input]

    # With a modern `ffmpeg-python` library, `complex_filter` is the correct and
    # fundamental way to build a filter graph with multiple inputs.
    processed_streams = ffmpeg.complex_filter(all_inputs, final_filter_graph)
    
    # Select the final video and audio streams from the graph's output pads.
    final_video = processed_streams['v']

    # --- Output ---
    stream = ffmpeg.output(
        final_video,
        audio_input.audio, # Explicitly select the audio component of the audio input
        payload.outputPath,
        vcodec='libx264',
        acodec='aac',
        pix_fmt='yuv420p', # Explicitly set pixel format for broad compatibility
        r=30,
        shortest=None # Use shortest if audio/video lengths might mismatch
    )
    
    print("Running FFMPEG command...")
    # Use overwrite_output() to avoid errors on re-runs
    stdout, stderr = stream.overwrite_output().run(capture_stdout=True, capture_stderr=True)
    print("FFMPEG command finished.")
    
    # Log output for debugging, which is much easier in a dedicated service
    print("FFMPEG STDOUT:", stdout.decode())
    print("FFMPEG STDERR:", stderr.decode())


# --- API Endpoint ---
@app.post("/render")
async def render_video_endpoint(payload: RenderPayload):
    try:
        # Ensure the output directory exists before trying to write to it
        output_dir = os.path.dirname(payload.outputPath)
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)
            
        create_video(payload)
        
        if os.path.exists(payload.outputPath):
            return {"status": "success", "path": payload.outputPath}
        else:
            raise HTTPException(status_code=500, detail="FFMPEG execution finished, but the output file was not created.")
            
    except ffmpeg.Error as e:
        # Catch specific ffmpeg errors to provide detailed stderr output
        print("An ffmpeg.Error occurred:", e.stderr.decode() if e.stderr else "No stderr")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"FFMPEG processing failed: {e.stderr.decode() if e.stderr else str(e)}")

    except Exception as e:
        import traceback
        print(f"An error occurred during video rendering: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Video processing failed: {str(e)}")

# --- Main entry point to run the server ---
if __name__ == "__main__":
    # To run: uvicorn video_renderer:app --host 0.0.0.0 --port 8001 --reload
    uvicorn.run(app, host="0.0.0.0", port=8001)