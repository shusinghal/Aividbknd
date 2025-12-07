import ffmpeg
import sys
import json
import os

def escape_ffmpeg_text(text):
    """
    Escapes text for use in an FFMPEG drawtext filter.
    This is a Python port of the TypeScript version for consistency.
    """
    return text.replace("'", "'\\''").replace(":", "\\:").replace("%", "\\%").replace("#", "\\#")

def create_video(payload):
    """
    Builds and runs the FFMPEG command using ffmpeg-python.
    """
    image_files = payload.get('imageFiles', [])
    audio_file = payload.get('audioFile')
    output_path = payload.get('outputPath')

    if not all([image_files, audio_file, output_path]):
        raise ValueError("Missing imageFiles, audioFile, or outputPath in payload")

    # --- Input Streams ---
    image_inputs = [
        ffmpeg.input(
            file['path'], 
            loop=1, 
            t=file['duration'], 
            framerate=30
        ) for file in image_files
    ]
    audio_input = ffmpeg.input(audio_file)

    # --- Filter Graph ---
    processed_video_streams = []
    for i, (file, stream) in enumerate(zip(image_files, image_inputs)):
        # 1. Scale and pad to 1080x1920
        scaled_stream = stream.filter(
            'scale', '1080', '1920', force_original_aspect_ratio='decrease'
        ).filter(
            'pad', '1080', '1920', '(ow-iw)/2', '(oh-ih)/2'
        ).filter('setsar', 1)

        # 2. Apply custom or default effects
        vf_command = file.get('ffmpegCommand')
        is_command_valid = vf_command and vf_command.strip() and vf_command.strip() != '{}'

        if is_command_valid:
            # The custom command is a string of filters, apply it
            processed_stream = scaled_stream.filter_('complex_script', f"aresample=44100[aud];[0:v]{vf_command}[v]")
        else:
            # Apply default fade in/out
            duration = file['duration']
            fade_out_start = max(0, duration - 0.5)
            processed_stream = scaled_stream.filter('fade', type='in', start_time=0, duration=0.5)
            processed_stream = processed_stream.filter('fade', type='out', start_time=fade_out_start, duration=0.5)

        # 3. Add on-screen text if present
        if file.get('onScreenText'):
            font_path = 'C:/Windows/Fonts/Arial.ttf' # NOTE: OS-dependent path
            escaped_text = escape_ffmpeg_text(file['onScreenText'])
            processed_stream = processed_stream.drawtext(
                fontfile=font_path,
                text=escaped_text,
                fontsize=60,
                fontcolor='white',
                x='(w-text_w)/2',
                y='(h-text_h)/2',
                box=1,
                boxcolor='black@0.5',
                boxborderw=10
            )

        processed_video_streams.append(processed_stream)

    # --- Concatenation ---
    concatenated_video = ffmpeg.concat(*processed_video_streams, v=1, a=0).format('yuv420p')

    # --- Output ---
    (
        ffmpeg
        .output(concatenated_video, audio_input.audio, output_path, vcodec='libx264', acodec='aac', r=30, shortest=None)
        .overwrite_output()
        .run(capture_stdout=True, capture_stderr=True)
    )

if __name__ == "__main__":
    try:
        # The JSON payload is passed as the first command-line argument
        json_payload = sys.argv[1]
        data = json.loads(json_payload)
        create_video(data)
        # If successful, print the output path to stdout
        print(json.dumps({"status": "success", "path": data['outputPath']}))
    except Exception as e:
        # If an error occurs, print it to stderr
        print(json.dumps({"status": "error", "message": str(e)}), file=sys.stderr)
        sys.exit(1)