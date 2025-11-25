const { pool } = require("../config/db");

const addSociety = async (req, res) => {
  try {
    const { societyName, address, city, state } = req.body;
    if (!societyName || !address || !city || !state) {
      return res.status(400).json({ message: "All fields are required." });
    }
    const query = {
      text: `INSERT INTO societies (society_name, address, city, state) VALUES ($1, $2, $3, $4) RETURNING *`,
      values: [societyName, address, city, state],
    };

    const user = req.user;
    const superAdminId = user.id;

    const result = await pool.query(query);

    //creating a chat for society
    await pool.query(
      `
          INSERT INTO chat (chatParticipants, chatTitle, status, society_id)
          VALUES (ARRAY[$1]::TEXT[], $2, 'active', $3)
        `,
      [superAdminId, societyName, result.rows[0].id]
    );

    return res.status(201).json({
      message: "Society added successfully.",
      society: result.rows[0],
    });
  } catch (error) {
    console.error("Error adding society:", error.message);

    return res.status(500).json({ message: "Internal Server Error" });
  }
};

const getSocieties = async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM societies`);
    return res.status(200).json({
      societies: result.rows,
    });
  } catch (error) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

const getSocietyById = async (req, res) => {
  const { id } = req.params;
  try {
    const query = {
      text: `SELECT * FROM societies WHERE id = $1`,
      values: [id],
    };
    const result = await pool.query(query);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Society not found." });
    }
    return res.status(200).json({
      society: result.rows[0],
    });
  } catch (error) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

const updateSociety = async (req, res) => {
  const { id } = req.params;
  const { societyName, address, city, state } = req.body;

  if (!societyName || !address || !city || !state) {
    return res.status(400).json({ message: "All fields are required." });
  }

  const query = {
    text: `UPDATE societies SET society_name = $1, address = $2, city = $3, state = $4 WHERE id = $5 RETURNING *`,
    values: [societyName, address, city, state, id],
  };

  try {
    const result = await pool.query(query);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Society not found." });
    }
    return res.status(200).json({
      message: "Society updated successfully.",
      society: result.rows[0],
    });
  } catch (error) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

const blockSociety = async (req, res) => {
  const { id } = req.params;

  try {
    // First, check if society exists
    const societyCheck = await pool.query(
      `SELECT * FROM societies WHERE id = $1`,
      [id]
    );
    
    if (societyCheck.rows.length === 0) {
      return res.status(404).json({ message: "Society not found." });
    }

    // Block the society
    const blockSocietyQuery = {
      text: `UPDATE societies SET is_blocked = TRUE WHERE id = $1 RETURNING *`,
      values: [id],
    };
    const result = await pool.query(blockSocietyQuery);

    // Block all users associated with this society
    await pool.query(
      `UPDATE users SET is_blocked = TRUE WHERE society_id = $1`,
      [id]
    );

    return res.status(200).json({
      message: "Society blocked successfully. All users in this society have been blocked.",
      society: result.rows[0],
    });
  } catch (error) {
    console.error("Error blocking society:", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

const unblockSociety = async (req, res) => {
  const { id } = req.params;

  try {
    // First, check if society exists
    const societyCheck = await pool.query(
      `SELECT * FROM societies WHERE id = $1`,
      [id]
    );
    
    if (societyCheck.rows.length === 0) {
      return res.status(404).json({ message: "Society not found." });
    }

    // Unblock the society
    const unblockSocietyQuery = {
      text: `UPDATE societies SET is_blocked = FALSE WHERE id = $1 RETURNING *`,
      values: [id],
    };
    const result = await pool.query(unblockSocietyQuery);

    // Unblock all users associated with this society
    await pool.query(
      `UPDATE users SET is_blocked = FALSE WHERE society_id = $1`,
      [id]
    );

    return res.status(200).json({
      message: "Society unblocked successfully. All users in this society have been unblocked.",
      society: result.rows[0],
    });
  } catch (error) {
    console.error("Error unblocking society:", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports = {
  addSociety,
  getSocieties,
  getSocietyById,
  updateSociety,
  blockSociety,
  unblockSociety,
};
