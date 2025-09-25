const jwt = require('jsonwebtoken');

/**
 * Generate access and refresh tokens for a user
 * @param {Object} user - User object with id, role, username, and society_id
 * @returns {Object} - Object containing access_token and refresh_token
 */
const generateTokens = (user) => {
  try {
    const access_token = jwt.sign(
      { id: user.id, role: user.role, username: user.username, society_id: user.society_id },
      process.env.JWT_ACCESS_SECRET,
      {
        expiresIn: process.env.JWT_ACCESS_EXPIRY,
      }
    );

    const refresh_token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_REFRESH_SECRET,
      {
        expiresIn: process.env.JWT_REFRESH_EXPIRY,
      }
    );

    return { access_token, refresh_token };
  } catch (error) {
    console.error(`ERROR: Generating access and refresh token: ${error}`);
    throw new Error('Failed to generate tokens');
  }
};

/**
 * Generate only access token
 * @param {Object} user - User object with id, role, username, and society_id
 * @returns {string} - Access token
 */
const generateAccessToken = (user) => {
  try {
    return jwt.sign(
      { id: user.id, role: user.role, username: user.username, society_id: user.society_id },
      process.env.JWT_ACCESS_SECRET,
      {
        expiresIn: process.env.JWT_ACCESS_EXPIRY,
      }
    );
  } catch (error) {
    console.error(`ERROR: Generating access token: ${error}`);
    throw new Error('Failed to generate access token');
  }
};

/**
 * Generate only refresh token
 * @param {Object} user - User object with id and username
 * @returns {string} - Refresh token
 */
const generateRefreshToken = (user) => {
  try {
    return jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_REFRESH_SECRET,
      {
        expiresIn: process.env.JWT_REFRESH_EXPIRY,
      }
    );
  } catch (error) {
    console.error(`ERROR: Generating refresh token: ${error}`);
    throw new Error('Failed to generate refresh token');
  }
};

/**
 * Verify a JWT token
 * @param {string} token - JWT token to verify
 * @param {string} secret - Secret key to verify with
 * @returns {Object} - Decoded token payload
 */
const verifyToken = (token, secret) => {
  try {
    return jwt.verify(token, secret);
  } catch (error) {
    console.error(`ERROR: Verifying token: ${error}`);
    throw new Error('Invalid token');
  }
};

module.exports = {
  generateTokens,
  generateAccessToken,
  generateRefreshToken,
  verifyToken
};
