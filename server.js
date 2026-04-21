const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { spawn } = require('child_process');

const app = express();
const server = http.createServer(app);
document.getElementById("connectBtn").onclick = () => {
  const keyVal = key.value.trim();
  const urlVal = rtmp.value.trim();

  if (!keyVal || !urlVal) {
    alert("Enter stream key + RTMP URL first");
    return;
  }

  // ✅ auto handle ws vs wss
  const protocol = location.protocol === "https:" ? "wss://" : "ws://";
  const wsUrl = protocol + location.host;

  console.log("Connecting to:", wsUrl);

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log("✅ WebSocket connected");

    ws.send(JSON.stringify({
      type: "configure",
      rtmpUrl: urlVal,
      streamKey: keyVal
    }));

    connected = true;
    document.getElementById("connectBtn").textContent = "Connected ✅";
  };

  ws.onmessage = (msg) => {
    console.log("📩 Server:", msg.data);
  };

  ws.onerror = (err) => {
    console.error("❌ WebSocket error:", err);
    alert("WebSocket connection failed (check server)");
  };

  ws.onclose = () => {
    console.log("🔌 WebSocket closed");
    connected = false;
    document.getElementById("connectBtn").textContent = "Connect";
  };
};

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

wss.on('connection', (ws) => {
  console.log('📱 Client connected');

  let ffmpeg = null;
  let rtmpUrl = '';
  let streamKey = '';

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      /* CONFIG */
      if (data.type === 'configure') {
        rtmpUrl = data.rtmpUrl.trim();
        streamKey = data.streamKey.trim();

        if (!rtmpUrl || !streamKey) {
          ws.send(JSON.stringify({ type: 'error', message: 'Missing RTMP or key' }));
          return;
        }

        console.log('✅ Configured:', rtmpUrl);
        ws.send(JSON.stringify({ type: 'configured' }));
      }

      /* START STREAM */
      if (data.type === 'start-stream') {
        if (ffmpeg) {
          console.log('⚠️ Already streaming');
          return;
        }

        const fullUrl = rtmpUrl.endsWith('/')
          ? rtmpUrl + streamKey
          : rtmpUrl + '/' + streamKey;

        console.log('🚀 Starting FFmpeg →', fullUrl);

        ffmpeg = spawn('ffmpeg', [
          '-loglevel', 'error',

          /* 🔥 CRITICAL FIX: tell FFmpeg it's WebM */
          '-f', 'webm',
          '-i', 'pipe:0',

          /* video */
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-tune', 'zerolatency',
          '-b:v', '2500k',
          '-maxrate', '2500k',
          '-bufsize', '5000k',
          '-pix_fmt', 'yuv420p',
          '-g', '60',

          /* audio */
          '-c:a', 'aac',
          '-b:a', '128k',
          '-ar', '44100',

          /* output */
          '-f', 'flv',
          fullUrl
        ]);

        ffmpeg.stderr.on('data', (d) => {
          console.log('FFmpeg:', d.toString());
        });

        ffmpeg.on('close', (code) => {
          console.log('❌ FFmpeg exited:', code);
          ffmpeg = null;
        });

        ffmpeg.on('error', (err) => {
          console.error('FFmpeg spawn error:', err);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'FFmpeg not found or failed to start'
          }));
        });

        ws.send(JSON.stringify({ type: 'streaming' }));
      }

      /* VIDEO DATA */
      if (data.type === 'video-chunk') {
        if (!ffmpeg || !ffmpeg.stdin.writable) return;

        try {
          const buffer = Buffer.from(data.chunk, 'base64');
          ffmpeg.stdin.write(buffer);
        } catch (e) {
          console.error('Chunk write error:', e);
        }
      }

      /* STOP */
      if (data.type === 'stop-stream') {
        if (ffmpeg) {
          console.log('⏹️ Stopping stream');

          ffmpeg.stdin.end();
          ffmpeg.kill('SIGINT');
          ffmpeg = null;
        }
      }

    } catch (err) {
      console.error('Message error:', err);
    }
  });

  ws.on('close', () => {
    console.log('🔌 Client disconnected');

    if (ffmpeg) {
      ffmpeg.kill('SIGINT');
      ffmpeg = null;
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on ${PORT}`);
  console.log(`🌐 http://localhost:${PORT}`);
  console.log(`🔌 ws://localhost:${PORT}`);
});
