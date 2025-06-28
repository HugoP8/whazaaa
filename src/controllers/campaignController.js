const db = require('../services/databaseService');
const whatsappService = require('../services/whatsappService');
const multer = require('multer');
const path = require('path');

// Configurar multer para archivos
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueName + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|mp4|pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido'));
    }
  }
}).single('media');

// Crear campaña
const createCampaign = async (req, res) => {
  try {
    const userId = req.userId;
    const { name, message, recipients, delay = 5000 } = req.body;
    const mediaPath = req.file ? req.file.path : null;
    
    // Validaciones
    if (!name || !message || !recipients) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }
    
    // Parsear destinatarios
    let recipientList;
    try {
      recipientList = JSON.parse(recipients);
    } catch (e) {
      return res.status(400).json({ error: 'Lista de destinatarios inválida' });
    }
    
    // Crear campaña en BD
    const campaign = await db.createCampaign(userId, name, message, mediaPath);
    
    // Actualizar con total de destinatarios
    await db.updateCampaign(campaign.id, {
      total_recipients: recipientList.length,
      status: 'IN_PROGRESS'
    });
    
    // Enviar mensajes en background
    whatsappService.sendBulkMessages(
      userId,
      recipientList,
      message,
      mediaPath,
      parseInt(delay)
    ).then(async (results) => {
      const successCount = results.filter(r => r.status === 'success').length;
      
      // Actualizar campaña
      await db.updateCampaign(campaign.id, {
        status: 'COMPLETED',
        sent_count: successCount,
        completed_at: new Date()
      });
      
      // Guardar resultados de mensajes
      for (const result of results) {
        await db.createMessage(
          campaign.id,
          result.recipient,
          result.status === 'success' ? 'SENT' : 'FAILED',
          result.messageId,
          result.error
        );
      }
      
      // Emitir evento de finalización
      global.io.emit(`campaign-completed-${userId}`, {
        campaignId: campaign.id,
        successCount,
        totalCount: results.length
      });
    }).catch(async (error) => {
      await db.updateCampaign(campaign.id, {
        status: 'FAILED',
        error: error.message
      });
    });
    
    res.json({ 
      message: 'Campaña iniciada', 
      campaignId: campaign.id,
      totalRecipients: recipientList.length
    });
    
  } catch (error) {
    console.error('Error creando campaña:', error);
    res.status(500).json({ error: error.message });
  }
};

// Obtener campañas
const getCampaigns = async (req, res) => {
  try {
    const userId = req.userId;
    const campaigns = await db.getCampaignsByUserId(userId);
    res.json(campaigns);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Obtener detalles de campaña
const getCampaignDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    
    const campaign = await db.getCampaignById(id, userId);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaña no encontrada' });
    }
    
    const messages = await db.getMessagesByCampaignId(id);
    
    res.json({
      campaign,
      messages
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  upload,
  createCampaign,
  getCampaigns,
  getCampaignDetails
};