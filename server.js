const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { spawn } = require('child_process');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Get port from environment or use 3000
const PORT = process.env.PORT || 3000;

// Serve static files from public directory
app.use(express.static('public'));

// Main route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint for Railway
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Stream Studio' });
});

// WebSocket relay server for Twitch/YouTube streaming
wss.on('connection', (ws) => {
  console.log('📱 Browser connected to relay server');
  let ffmpegProcess = null;
  let rtmpUrl = '';
  let streamKey = '';

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'configure') {
        rtmpUrl = data.rtmpUrl;
        streamKey = data.streamKey;
        console.log(`✅ Configured for streaming to ${rtmpUrl}`);
        ws.send(JSON.stringify({ type: 'configured' }));
      }

      if (data.type === 'start-stream') {
        // Start FFmpeg process to relay to RTMP
        const fullRtmpUrl = rtmpUrl + streamKey;
        
        // Check if FFmpeg is available
        const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
        
        ffmpegProcess = spawn(ffmpegPath, [
          '-i', 'pipe:0',
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-b:v', '3000k',
          '-maxrate', '3000k',
          '-bufsize', '6000k',
          '-pix_fmt', 'yuv420p',
          '-g', '50',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-ar', '44100',
          '-f', 'flv',
          fullRtmpUrl
        ]);

        ffmpegProcess.stderr.on('data', (data) => {
          console.log(`FFmpeg: ${data}`);
        });

        ffmpegProcess.on('error', (err) => {
          console.error('FFmpeg error:', err);
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: 'FFmpeg not available. Streaming requires FFmpeg to be installed.' 
          }));
        });

        console.log('🔴 Streaming started!');
        ws.send(JSON.stringify({ type: 'streaming' }));
      }

      if (data.type === 'video-chunk') {
        // Relay video chunks to FFmpeg
        if (ffmpegProcess && ffmpegProcess.stdin.writable) {
          const buffer = Buffer.from(data.chunk, 'base64');
          ffmpegProcess.stdin.write(buffer);
        }
      }

      if (data.type === 'stop-stream') {
        if (ffmpegProcess) {
          ffmpegProcess.stdin.end();
          ffmpegProcess.kill();
          console.log('⏹️ Streaming stopped');
        }
      }
    } catch (err) {
      console.error('WebSocket message error:', err);
    }
  });

  ws.on('close', () => {
    if (ffmpegProcess) {
      ffmpegProcess.kill();
    }
    console.log('📱 Browser disconnected');
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Stream Studio running on port ${PORT}`);
  console.log(`📺 Frontend: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket relay: ws://localhost:${PORT}`);
  console.log('');
  console.log('⚠️  For Twitch streaming, FFmpeg must be installed');
  console.log('   Recording features work without FFmpeg');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
