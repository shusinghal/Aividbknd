import ffmpeg

def create_zoom_video(input_path, output_path, zoom_expr, x_expr, y_expr, duration, size):
    ( 
        ffmpeg
        .input(input_path)
        .zoompan(z=zoom_expr, x=x_expr, y=y_expr, d=duration, s=size)
        .output(output_path, pix_fmt='yuv420p', vcodec='libx264', r=30)
        .overwrite_output()
        .run()
    )
    print(f"Video processed successfully. Output saved to {output_path}")

if __name__ == '__main__':
    input_video_path = 'backend/public/assets/videos/The_Blank_Page_Nearly_Broke_Me___Until_Jasper_AI___1761470604829.mp4'
    output_video_path = 'backend/public/assets/videos/simple_zoom_output.mp4'

    # Conditional zoom-in effect for the first 16.5 seconds
    zoom = "'if(between(t,0,16.5),pzoom+0.001,1)'"
    x = 'iw/2-(iw/zoom/2)'
    y = 'ih/2-(ih/zoom/2)'
    duration = 1 # evaluate every frame
    size = '1080x1920'

    create_zoom_video(input_video_path, output_video_path, zoom, x, y, duration, size)