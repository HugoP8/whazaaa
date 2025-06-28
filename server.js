require('dotenv').config();
const app = require('./src/app');
const http = require('http');
const { Server } = require('socket.io');
const { initializeWhatsApp } = require('./src/services/whatsappService');

const PORT = process.env.PORT || 3000;

// Crear servidor HTTP
const server = http.createServer(app);

// Configurar Socket.io
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true
  }
});

// Inicializar WhatsApp con Socket.io
initializeWhatsApp(io);

// Conexión Socket.io
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

// Hacer io disponible globalmente
global.io = io;

// Iniciar servidor
server.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`📱 WhatsApp Service inicializado`);
});