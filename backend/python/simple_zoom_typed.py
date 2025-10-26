from typed_ffmpeg import FFMPEG, VideoStream, Filter, Global

input_video_path = 'backend/public/assets/videos/The_Blank_Page_Nearly_Broke_Me___Until_Jasper_AI___1761470604829.mp4'
output_video_path = 'backend/public/assets/videos/simple_zoom_typed_output.mp4'

( 
    FFMPEG()
    .input(input_video_path)
    .zoompan(z='pzoom+0.001', x='iw/2-(iw/zoom/2)', y='ih/2-(ih/zoom/2)', d=1, s='1080x1920')
    .output(output_video_path, pix_fmt='yuv420p', vcodec='libx264', r=30)
    .overwrite()
    .run()
)

print(f"Video processed successfully. Output saved to {output_video_path}")
