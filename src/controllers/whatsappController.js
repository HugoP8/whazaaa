const whatsappService = require('../services/whatsappService');

// Conectar WhatsApp
const connect = async (req, res) => {
  try {
    const userId = req.userId;
    await whatsappService.connectToWhatsApp(userId);
    res.json({ message: 'Conectando a WhatsApp...' });
  } catch (error) {
    console.error('Error conectando WhatsApp:', error);
    res.status(500).json({ error: error.message });
  }
};

// Estado de conexión
const status = async (req, res) => {
  try {
    const userId = req.userId;
    const connectionStatus = await whatsappService.getConnectionStatus(userId);
    res.json(connectionStatus);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Desconectar
const logout = async (req, res) => {
  try {
    const userId = req.userId;
    await whatsappService.logout(userId);
    res.json({ message: 'Desconectado exitosamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Obtener grupos
const getGroups = async (req, res) => {
  try {
    const userId = req.userId;
    const groups = await whatsappService.getGroups(userId);
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Obtener contactos
const getContacts = async (req, res) => {
  try {
    const userId = req.userId;
    const contacts = await whatsappService.getContacts(userId);
    res.json(contacts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  connect,
  status,
  logout,
  getGroups,
  getContacts
};