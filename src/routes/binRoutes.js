const express = require('express');
const router = express.Router();
const binController = require('../controllers/binController');

router.post('/', binController.createBin);
router.get('/', binController.listBins);
router.get('/:id', binController.getBin);
router.put('/:id', binController.updateBin);
router.delete('/:id', binController.removeBin);

module.exports = router;
