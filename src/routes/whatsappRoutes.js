const express = require('express');
const router = express.Router();
const whatsappController = require('../controllers/whatsappController');
const authMiddleware = require('../middleware/auth');

// Todas las rutas requieren autenticación
router.use(authMiddleware);

router.post('/connect', whatsappController.connect);
router.get('/status', whatsappController.status);
router.post('/logout', whatsappController.logout);
router.get('/groups', whatsappController.getGroups);
router.get('/contacts', whatsappController.getContacts);

module.exports = router;