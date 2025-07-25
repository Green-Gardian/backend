const express = require('express');
const { addDriver, getDrivers, updateDriver, deleteDriver , assignWorkArea , getDriverWorkAreas , getCollectionRoutes , getCurrentTasks , updateTaskStatus , updateDriverLocation , getDriverSchedule , getDriverPerformance} = require('../controllers/driverController');

const router = express.Router();

router.post('/add-driver', addDriver);
router.get('/get-drivers', getDrivers);
router.put('/update-driver/:id', updateDriver);
router.delete('/delete-driver/:id', deleteDriver);
router.post('/assign-work-area', assignWorkArea);
router.get('/:driverId/work-areas', getDriverWorkAreas);
router.get('/:driverId/routes', getCollectionRoutes);
router.get('/current-tasks', getCurrentTasks);
router.put('/tasks/:taskId/status', updateTaskStatus);
router.put('/location', updateDriverLocation);
router.get('/:driverId/schedule', getDriverSchedule);
router.get('/:driverId/performance', getDriverPerformance);

module.exports = router;