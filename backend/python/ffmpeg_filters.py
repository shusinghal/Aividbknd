
import ffmpeg

# This script replicates the functionality of ffmpeg.effects.ts and ffmpeg.effects.service.ts
# using the ffmpeg-python library.

# --- Replicating effectLibrary from ffmpeg.effects.ts ---

def slow_zoom_in(stream, options):
    """
    A gentle, continuous zoom-in over the entire clip duration.
    """
    duration = options['duration']
    width = options['width']
    height = options['height']
    return stream.zoompan(
        z='min(zoom+0.001,1.2)',
        d=duration * 30, # Assuming 30 FPS
        x='iw/2-(iw/zoom/2)',
        y='ih/2-(ih/zoom/2)',
        s=f'{width}x{height}'
    ).filter('format', 'yuv420p')

def slow_zoom_out(stream, options):
    """
    A gentle, continuous zoom-out, starting from a slightly zoomed-in state.
    """
    duration = options['duration']
    width = options['width']
    height = options['height']
    return stream.zoompan(
        z='if(gte(zoom,1.001),max(1,zoom-0.001),1.2)',
        d=duration * 30, # Assuming 30 FPS
        x='iw/2-(iw/zoom/2)',
        y='ih/2-(ih/zoom/2)',
        s=f'{width}x{height}'
    ).filter('format', 'yuv420p')

def pan_right(stream, options):
    """
    A slow, continuous pan from left to right.
    """
    duration = options['duration']
    width = options['width']
    height = options['height']
    pan_speed = 50
    return stream.zoompan(
        z=1.1,
        x=f'min(iw/2-iw/2/1.1,t*{pan_speed})',
        y='ih/2-ih/2/1.1',
        d=duration * 30,
        s=f'{width}x{height}'
    ).filter('format', 'yuv420p')

def pan_left(stream, options):
    """
    A slow, continuous pan from right to left.
    """
    duration = options['duration']
    width = options['width']
    height = options['height']
    pan_speed = 50
    return stream.zoompan(
        z=1.1,
        x=f'iw/2-iw/2/1.1-t*{pan_speed}',
        y='ih/2-ih/2/1.1',
        d=duration * 30,
        s=f'{width}x{height}'
    ).filter('format', 'yuv420p')

def fade_in(stream, options):
    """
    Fades the clip in from black at the beginning.
    """
    return stream.filter('fade', type='in', start_time=0, duration=0.5)

def fade_out(stream, options):
    """
    Fades the clip out to black at the end.
    """
    duration = options['duration']
    start_time = max(0, duration - 1)
    return stream.filter('fade', type='out', start_time=start_time, duration=1)

def vignette(stream, options):
    """
    Applies a subtle vignette effect, darkening the corners.
    """
    return stream.filter('vignette', angle='PI/5')

def static(stream, options):
    """
    A static effect for when no motion is needed. Ensures format compatibility.
    """
    return stream.filter('format', 'yuv420p')

effect_library = {
    'slow_zoom_in': slow_zoom_in,
    'slow_zoom_out': slow_zoom_out,
    'pan_right': pan_right,
    'pan_left': pan_left,
    'fade_in': fade_in,
    'fade_out': fade_out,
    'vignette': vignette,
    'static': static,
}


class EffectComposer:
    def __init__(self, layers, context):
        self.layers = layers
        self.context = context

    def get_expression(self, param, layer):
        if not isinstance(param, dict) or 'start' not in param or 'end' not in param:
            return str(param)

        start = param['start']
        end = param['end']
        easing = param.get('easing', 'linear')
        
        start_time = layer['startTime']
        end_time = layer['endTime']
        duration = end_time - start_time

        nt = f'(t-{start_time})/{duration}'

        eased_time = {
            'easeIn': f'pow({nt},2)',
            'easeOut': f'1-pow(1-{nt},2)',
            'easeInOut': f'if(lt({nt},0.5),2*pow({nt},2),1-pow(-2*{nt}+2,2)/2)',
            'linear': nt,
        }.get(easing, nt)

        expression = f'{start}+({end}-({start}))*{eased_time}'
        return f'if(between(t,{start_time},{end_time}),{expression},if(lt(t,{start_time}),{start},{end}))'

    def compose(self, stream):
        zoom_expression = '1.0'
        pan_x_expression = '0'
        pan_y_expression = '0'

        for layer in self.layers:
            enable_expr = f'between(t,{layer["startTime"]},{layer["endTime"]})'
            
            if layer['name'] == 'zoom':
                if 'level' in layer.get('params', {}):
                    zoom_expression = self.get_expression(layer['params']['level'], layer)
            
            elif layer['name'] == 'pan':
                pan_speed = 80
                pan_amount = f'min(t-{layer["startTime"]}, {layer["endTime"] - layer["startTime"]})*{pan_speed}'
                direction = layer.get('params', {}).get('direction')
                if direction == 'left':
                    pan_x_expression = f'-({pan_amount})'
                elif direction == 'right':
                    pan_x_expression = f'+({pan_amount})'
                elif direction == 'up':
                    pan_y_expression = f'-({pan_amount})'
                elif direction == 'down':
                    pan_y_expression = f'+({pan_amount})'

            elif layer['name'] == 'shake':
                intensity = self.get_expression(layer.get('params', {}).get('intensity', 0), layer)
                pan_x_expression += f'+({intensity}*sin(2*PI*t*10))'
                pan_y_expression += f'+({intensity}*cos(2*PI*t*13))'

            elif layer['name'] == 'fade':
                fade_type = layer.get('params', {}).get('type')
                if fade_type:
                    stream = stream.filter('fade', type=fade_type, start_time=layer['startTime'], duration=layer['endTime'] - layer['startTime'])

            elif layer['name'] == 'vignette':
                stream = stream.filter('vignette', angle='PI/5', enable=enable_expr)

            elif layer['name'] == 'gaussianBlur':
                if 'sigma' in layer.get('params', {}):
                    sigma_expr = self.get_expression(layer['params']['sigma'], layer)
                    stream = stream.filter('gblur', sigma=sigma_expr, enable=enable_expr)

        # Apply zoom, pan, and shake together in one zoompan filter
        total_frames = int(self.context['duration'] * 30) # Assuming 30 FPS
        final_zoom_expr = f'max({zoom_expression}, 1.1)' if any(l['name'] in ['pan', 'shake'] for l in self.layers) else zoom_expression
        
        stream = stream.filter('zoompan', z=final_zoom_expr, x=f'iw/2-(iw/zoom/2)+{pan_x_expression}', y=f'ih/2-(ih/zoom/2)+{pan_y_expression}', d=total_frames, s=f'{self.context["width"]}x{self.context["height"]}')
        
        return stream.filter('format', 'yuv420p')


if __name__ == '__main__':
    # Example usage of EffectComposer:
    input_video_path = 'backend/public/assets/videos/The_Blank_Page_Nearly_Broke_Me___Until_Jasper_AI___1761470604829.mp4'
    output_video_path = 'backend/public/assets/videos/composer_output.mp4'

    try:
        # Get video properties
        probe = ffmpeg.probe(input_video_path)
    except ffmpeg.Error as e:
        if e.stdout:
            print('stdout:', e.stdout.decode('utf8'))
        if e.stderr:
            print('stderr:', e.stderr.decode('utf8'))
        raise e
        
    video_info = next((s for s in probe['streams'] if s['codec_type'] == 'video'), None)
    width = video_info['width']
    height = video_info['height']
    duration = float(video_info['duration'])

    # Define effect layers
    effect_layers = [
        {
            'name': 'zoom',
            'startTime': 0,
            'endTime': duration / 2,
            'params': {'level': {'start': 1, 'end': 1.2, 'easing': 'easeInOut'}}
        },
        {
            'name': 'pan',
            'startTime': duration / 2,
            'endTime': duration,
            'params': {'direction': 'right'}
        },
        {
            'name': 'fade',
            'startTime': 0,
            'endTime': 1,
            'params': {'type': 'in'}
        },
        {
            'name': 'fade',
            'startTime': duration -1,
            'endTime': duration,
            'params': {'type': 'out'}
        }
    ]

    context = {'duration': duration, 'width': width, 'height': height}

    # Create an input stream
    input_stream = ffmpeg.input(input_video_path)

    # Create and apply the effect composition
    composer = EffectComposer(effect_layers, context)
    processed_stream = composer.compose(input_stream)

    # Create the output stream and run the ffmpeg command
    output = ffmpeg.output(processed_stream, output_video_path)
    
    try:
        output.run(overwrite_output=True)
        print(f"Video processed successfully. Output saved to {output_video_path}")
    except ffmpeg.Error as e:
        if e.stdout:
            print('stdout:', e.stdout.decode('utf8'))
        if e.stderr:
            print('stderr:', e.stderr.decode('utf8'))
