from flask import Flask, jsonify, request
import yt_dlp
import logging

app = Flask(__name__)
log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

ydl_opts = {
    'format': 'bestaudio/best',
    'quiet': True,
    'no_warnings': True,
    'extract_flat': False,
    'nocheckcertificate': True,
    'noplaylist': True,
    'source_address': '0.0.0.0'
}

@app.route('/health')
def health():
    return jsonify({'status': 'running'}), 200

@app.route('/stream')
def get_stream():
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({'error': 'Missing query'}), 400

    if query.startswith('http') or (len(query) == 11 and ' ' not in query):
        search_target = query
    else:
        search_target = f"ytsearch1:{query} audio"

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(search_target, download=False)
            if 'entries' in info and info['entries']:
                info = info['entries'][0]

            stream_url = info.get('url')
            if not stream_url and 'formats' in info:
                audio_formats = [f for f in info['formats'] if f.get('acodec') != 'none']
                if audio_formats:
                    stream_url = audio_formats[-1].get('url')

            return jsonify({
                'id': info.get('id', ''),
                'title': info.get('title', ''),
                'artist': info.get('uploader', info.get('channel', 'Unknown Artist')),
                'cover': info.get('thumbnail', ''),
                'url': stream_url,
                'duration': info.get('duration', 0)
            })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def start_server():
    app.run(host='127.0.0.1', port=8080, threaded=True, debug=False)
