const pool = require('../config/database');

class DatabaseService {
  // Usuarios
  async createUser(email, hashedPassword, name) {
    const query = 'INSERT INTO users (email, password, name) VALUES ($1, $2, $3) RETURNING *';
    const result = await pool.query(query, [email, hashedPassword, name]);
    return result.rows[0];
  }

  async getUserByEmail(email) {
    const query = 'SELECT * FROM users WHERE email = $1';
    const result = await pool.query(query, [email]);
    return result.rows[0];
  }

  async getUserById(id) {
    const query = 'SELECT id, email, name, created_at FROM users WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Campañas
  async createCampaign(userId, name, message, mediaPath = null) {
    const query = `
      INSERT INTO campaigns (user_id, name, message, media_path, scheduled_at) 
      VALUES ($1, $2, $3, $4, NOW()) 
      RETURNING *
    `;
    const result = await pool.query(query, [userId, name, message, mediaPath]);
    return result.rows[0];
  }

  async updateCampaign(id, updates) {
    const fields = [];
    const values = [];
    let index = 1;

    Object.keys(updates).forEach(key => {
      fields.push(`${key} = $${index}`);
      values.push(updates[key]);
      index++;
    });

    values.push(id);
    const query = `UPDATE campaigns SET ${fields.join(', ')} WHERE id = $${index} RETURNING *`;
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  async getCampaignsByUserId(userId) {
    const query = `
      SELECT c.*, 
        COUNT(m.id) as message_count,
        COUNT(CASE WHEN m.status = 'SENT' THEN 1 END) as sent_count_real
      FROM campaigns c
      LEFT JOIN messages m ON c.id = m.campaign_id
      WHERE c.user_id = $1
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `;
    const result = await pool.query(query, [userId]);
    return result.rows;
  }

  async getCampaignById(id, userId) {
    const query = 'SELECT * FROM campaigns WHERE id = $1 AND user_id = $2';
    const result = await pool.query(query, [id, userId]);
    return result.rows[0];
  }

  // Mensajes
  async createMessage(campaignId, recipient, status, messageId = null, error = null) {
    const query = `
      INSERT INTO messages (campaign_id, recipient, status, message_id, error) 
      VALUES ($1, $2, $3, $4, $5) 
      RETURNING *
    `;
    const result = await pool.query(query, [campaignId, recipient, status, messageId, error]);
    return result.rows[0];
  }

  async getMessagesByCampaignId(campaignId, limit = 100) {
    const query = `
      SELECT * FROM messages 
      WHERE campaign_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2
    `;
    const result = await pool.query(query, [campaignId, limit]);
    return result.rows;
  }

  // Contactos
  async saveContacts(userId, contacts) {
    const savedContacts = [];
    
    for (const contact of contacts) {
      const query = `
        INSERT INTO contacts (user_id, name, phone) 
        VALUES ($1, $2, $3) 
        ON CONFLICT (user_id, phone) 
        DO UPDATE SET name = $2
        RETURNING *
      `;
      const result = await pool.query(query, [userId, contact.name, contact.phone]);
      savedContacts.push(result.rows[0]);
    }
    
    return savedContacts;
  }

  async getContactsByUserId(userId) {
    const query = 'SELECT * FROM contacts WHERE user_id = $1 ORDER BY name';
    const result = await pool.query(query, [userId]);
    return result.rows;
  }

  // Sesiones WhatsApp
  async saveWhatsAppSession(userId, sessionData) {
    const query = `
      INSERT INTO whatsapp_sessions (user_id, session_data, is_active, last_connected) 
      VALUES ($1, $2, true, NOW()) 
      ON CONFLICT (user_id) 
      DO UPDATE SET session_data = $2, is_active = true, last_connected = NOW()
      RETURNING *
    `;
    const result = await pool.query(query, [userId, sessionData]);
    return result.rows[0];
  }

  async getWhatsAppSession(userId) {
    const query = 'SELECT * FROM whatsapp_sessions WHERE user_id = $1';
    const result = await pool.query(query, [userId]);
    return result.rows[0];
  }

  async updateSessionStatus(userId, isActive) {
    const query = 'UPDATE whatsapp_sessions SET is_active = $1 WHERE user_id = $2';
    await pool.query(query, [isActive, userId]);
  }

  async getAllUsers() {
  const result = await pool.query('SELECT id, email, name FROM public.users');
  return result.rows;
}
}

module.exports = new DatabaseService();