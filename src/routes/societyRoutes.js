
const Router = require('express').Router();
const { addSociety, getSocieties, getSocietyById, updateSociety, blockSociety, unblockSociety } = require('../controllers/societyController');
const { verifyToken } = require('../middlewares/authMiddleware');

const verifySuperAdmin = (req, res, next) => {
    const user = req.user;
    if (user && user.role === 'super_admin') {
        next();
    } else {
        return res.status(403).json({ message: "Forbidden" });
    }
}

Router.post('/add-society', verifyToken, verifySuperAdmin, addSociety);
Router.get('/get-societies', verifyToken, verifySuperAdmin, getSocieties);
Router.get('/get-society/:id', verifyToken, getSocietyById);
Router.put('/update-society/:id', verifyToken, verifySuperAdmin, updateSociety);
Router.put('/block-society/:id', verifyToken, verifySuperAdmin, blockSociety);
Router.put('/unblock-society/:id', verifyToken, verifySuperAdmin, unblockSociety);

module.exports = Router;


