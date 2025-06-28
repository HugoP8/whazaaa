const makeWASocket = require('@whiskeysockets/baileys').default;
const { 
  DisconnectReason, 
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  delay
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const qrcode = require('qrcode');
const fs = require('fs').promises;
const path = require('path');

// Almacenar conexiones por usuario
const connections = new Map();
let io = null;

// Inicializar con Socket.io
const initializeWhatsApp = (socketIo) => {
  io = socketIo;
};

// Conectar a WhatsApp
const connectToWhatsApp = async (userId) => {
  const logger = pino({ level: 'error' });
  const sessionPath = path.join(__dirname, '../../sessions', `user-${userId}`);
  
  // Crear directorio de sesión si no existe
  await fs.mkdir(sessionPath, { recursive: true });
  
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();
  
  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    generateHighQualityLinkPreview: true,
  });
  
  // Eventos de conexión
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      // Generar código QR
      const qrCode = await qrcode.toDataURL(qr);
      io.emit(`qr-${userId}`, qrCode);
    }
    
    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      console.log('Conexión cerrada:', lastDisconnect?.error);
      
      if (shouldReconnect) {
        setTimeout(() => connectToWhatsApp(userId), 5000);
      } else {
        connections.delete(userId);
      }
      
      io.emit(`connection-status-${userId}`, { connected: false });
    } else if (connection === 'open') {
      console.log('✅ WhatsApp conectado para usuario:', userId);
      io.emit(`connection-status-${userId}`, { connected: true });
    }
  });
  
  // Guardar credenciales
  sock.ev.on('creds.update', saveCreds);
  
  // Escuchar mensajes
  sock.ev.on('messages.upsert', async (m) => {
    const message = m.messages[0];
    if (!message.key.fromMe && m.type === 'notify') {
      io.emit(`new-message-${userId}`, {
        from: message.key.remoteJid,
        message: message.message?.conversation || 'Mensaje multimedia',
        timestamp: message.messageTimestamp
      });
    }
  });
  
  // Guardar conexión
  connections.set(userId, sock);
  
  return sock;
};

// Enviar mensaje individual
const sendMessage = async (userId, jid, content, options = {}) => {
  const sock = connections.get(userId);
  if (!sock) {
    throw new Error('WhatsApp no está conectado');
  }
  
  try {
    const result = await sock.sendMessage(jid, content, options);
    return result;
  } catch (error) {
    console.error('Error enviando mensaje:', error);
    throw error;
  }
};

// Enviar mensajes masivos
const sendBulkMessages = async (userId, recipients, messageTemplate, mediaPath = null, delayMs = 5000) => {
  const sock = connections.get(userId);
  if (!sock) {
    throw new Error('WhatsApp no está conectado');
  }
  
  const results = [];
  
  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];
    
    try {
      let content = { text: messageTemplate };
      
      // Si hay archivo multimedia
      if (mediaPath) {
        const media = await fs.readFile(mediaPath);
        const filename = path.basename(mediaPath);
        
        if (mediaPath.match(/\.(jpg|jpeg|png)$/i)) {
          content = { image: media, caption: messageTemplate };
        } else if (mediaPath.match(/\.(mp4|avi)$/i)) {
          content = { video: media, caption: messageTemplate };
        } else {
          content = { document: media, fileName: filename };
        }
      }
      
      const result = await sock.sendMessage(recipient, content);
      results.push({ 
        recipient, 
        status: 'success', 
        messageId: result.key.id 
      });
      
      // Emitir progreso
      io.emit(`message-progress-${userId}`, {
        recipient,
        status: 'success',
        current: i + 1,
        total: recipients.length
      });
      
      // Delay entre mensajes
      if (i < recipients.length - 1) {
        await delay(delayMs);
      }
      
    } catch (error) {
      console.error(`Error enviando a ${recipient}:`, error);
      results.push({ 
        recipient, 
        status: 'error', 
        error: error.message 
      });
      
      io.emit(`message-progress-${userId}`, {
        recipient,
        status: 'error',
        error: error.message,
        current: i + 1,
        total: recipients.length
      });
    }
  }
  
  return results;
};

// Obtener grupos
const getGroups = async (userId) => {
  const sock = connections.get(userId);
  if (!sock) {
    throw new Error('WhatsApp no está conectado');
  }
  
  try {
    const groups = await sock.groupFetchAllParticipating();
    return Object.values(groups).map(group => ({
      id: group.id,
      subject: group.subject,
      desc: group.desc,
      participants: group.participants,
      creation: group.creation,
      owner: group.owner
    }));
  } catch (error) {
    console.error('Error obteniendo grupos:', error);
    throw error;
  }
};

// Obtener contactos
const getContacts = async (userId) => {
  const sock = connections.get(userId);
  if (!sock) {
    throw new Error('WhatsApp no está conectado');
  }
  
  try {
    // En Baileys, los contactos están en el store
    const contacts = sock.store?.contacts || {};
    return Object.entries(contacts).map(([jid, contact]) => ({
      id: jid,
      name: contact.name || contact.notify || jid.split('@')[0],
      phone: jid
    }));
  } catch (error) {
    console.error('Error obteniendo contactos:', error);
    throw error;
  }
};

// Desconectar
const logout = async (userId) => {
  const sock = connections.get(userId);
  if (sock) {
    await sock.logout();
    connections.delete(userId);
  }
};

// Verificar estado de conexión
const isConnected = (userId) => {
  return connections.has(userId);
};

// Obtener estado de conexión
const getConnectionStatus = async (userId) => {
  const sock = connections.get(userId);
  return {
    connected: !!sock && sock.ws?.readyState === 1,
    user: sock?.user
  };
};

module.exports = {
  initializeWhatsApp,
  connectToWhatsApp,
  sendMessage,
  sendBulkMessages,
  getGroups,
  getContacts,
  logout,
  isConnected,
  getConnectionStatus
};