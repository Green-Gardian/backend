# Alert Broadcasting System

## Overview

The Alert Broadcasting System is a comprehensive multi-channel notification system that sends real-time alerts via push notifications, SMS, and email. It manages communication logs and user preferences for different types of alerts and status updates.

## Features

- **Multi-channel Notifications**: Email, SMS, and Push notifications
- **Real-time Broadcasting**: WebSocket-based real-time notifications
- **Scheduled Alerts**: Schedule alerts for future delivery
- **User Preferences**: Per-user notification channel preferences
- **Role-based Access Control**: Different permissions for different user roles
- **Communication Logs**: Track delivery status and communication history
- **Alert Templates**: Predefined templates for different alert types
- **Priority Levels**: Low, Medium, High, and Critical priority support
- **Society-based Broadcasting**: Send alerts to specific societies or all users

## System Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend API    │    │   Database      │
│                 │◄──►│                  │◄──►│                 │
│ - React App     │    │ - Express.js     │    │ - PostgreSQL    │
│ - WebSocket     │    │ - WebSocket      │    │ - Alert Tables  │
│   Client        │    │   Server         │    │ - User Tables   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │  Notification    │
                       │   Services       │
                       │                  │
                       │ - Email (SMTP)   │
                       │ - SMS (Vonage)   │
                       │ - Push (Web)     │
                       └──────────────────┘
```

## Database Schema

### Core Tables

#### `alert_types`
- `id`: Primary key
- `name`: Alert type name (e.g., 'emergency', 'maintenance')
- `description`: Alert type description
- `priority`: Default priority level
- `is_active`: Whether the alert type is active

#### `alerts`
- `id`: Primary key
- `title`: Alert title
- `message`: Alert message
- `alert_type_id`: Reference to alert_types
- `society_id`: Reference to societies
- `sender_id`: Reference to users (who sent the alert)
- `priority`: Priority level
- `status`: Current status (pending, sent, failed, cancelled)
- `scheduled_for`: When to send (for scheduled alerts)
- `expires_at`: When the alert expires

#### `alert_recipients`
- `id`: Primary key
- `alert_id`: Reference to alerts
- `user_id`: Reference to users
- `email_sent`, `sms_sent`, `push_sent`: Delivery status flags
- `email_sent_at`, `sms_sent_at`, `push_sent_at`: Timestamps

#### `user_notification_preferences`
- `id`: Primary key
- `user_id`: Reference to users
- `alert_type_id`: Reference to alert_types
- `email_enabled`, `sms_enabled`, `push_enabled`: Channel preferences

#### `communication_logs`
- `id`: Primary key
- `alert_id`: Reference to alerts
- `user_id`: Reference to users
- `channel`: Communication channel (email, sms, push)
- `status`: Delivery status (success, failed, pending)
- `message_id`: External service message ID
- `error_message`: Error details if failed

#### `push_tokens`
- `id`: Primary key
- `user_id`: Reference to users
- `token`: Push notification token
- `device_type`: Device type (web, android, ios)

## API Endpoints

### Authentication Required Endpoints

#### Alert Management
- `POST /alerts` - Create a new alert
- `GET /alerts` - Get all alerts with filtering and pagination
- `GET /alerts/:alertId` - Get alert details
- `PUT /alerts/:alertId` - Update an alert
- `DELETE /alerts/:alertId` - Cancel an alert
- `GET /alerts/stats` - Get alert statistics

#### User Preferences
- `GET /alerts/preferences` - Get user notification preferences
- `PUT /alerts/preferences` - Update user notification preferences
- `POST /alerts/push-token` - Register push notification token

#### Communication Logs
- `GET /alerts/logs` - Get communication logs (admin/super admin only)

#### System Management
- `POST /alerts/test-notification` - Test notification service (super admin only)
- `GET /websocket/stats` - Get WebSocket connection statistics (admin/super admin only)

### Public Endpoints
- `GET /alerts/types` - Get available alert types

## WebSocket Events

### Client to Server
- `authenticate` - Authenticate user and join rooms
- `join-society` - Join society-specific room
- `leave-society` - Leave society-specific room
- `update-preferences` - Update notification preferences
- `ping` - Health check ping

### Server to Client
- `authenticated` - Authentication successful
- `auth-error` - Authentication failed
- `society-joined` - Successfully joined society room
- `society-left` - Successfully left society room
- `new-alert` - New alert notification
- `personal-alert` - Personal alert notification
- `alert-updated` - Alert updated notification
- `alert-cancelled` - Alert cancelled notification
- `delivery-status` - Notification delivery status
- `system-message` - System broadcast message
- `preferences-updated` - Preferences updated confirmation
- `pong` - Health check response

## Usage Examples

### Creating an Alert

```javascript
// Create immediate alert
const alertData = {
    title: "System Maintenance",
    message: "Scheduled maintenance will begin in 30 minutes",
    alertTypeId: 1,
    societyId: 123,
    priority: "medium"
};

const response = await fetch('/alerts', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(alertData)
});
```

### Scheduling an Alert

```javascript
// Schedule alert for future
const alertData = {
    title: "Reminder",
    message: "Don't forget to submit your weekly report",
    alertTypeId: 4,
    societyId: 123,
    priority: "low",
    scheduledFor: "2024-01-15T09:00:00Z"
};

const response = await fetch('/alerts', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(alertData)
});
```

### WebSocket Connection

```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:3001');

// Authenticate user
socket.emit('authenticate', {
    userId: 123,
    societyId: 456,
    role: 'admin'
});

// Listen for new alerts
socket.on('new-alert', (alert) => {
    console.log('New alert received:', alert);
    // Show notification to user
});

// Listen for personal alerts
socket.on('personal-alert', (alert) => {
    console.log('Personal alert received:', alert);
    // Show personal notification
});
```

### Updating User Preferences

```javascript
const preferences = {
    alertTypeId: 1,
    emailEnabled: true,
    smsEnabled: false,
    pushEnabled: true
};

const response = await fetch('/alerts/preferences', {
    method: 'PUT',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(preferences)
});
```

## Environment Variables

```bash
# Database
DB_USER=your_db_user
DB_HOST=localhost
DB_DATABASE=greenguardian
DB_PASSWORD=your_db_password
DB_PORT=5432

# Email (SMTP)
SENDER_EMAIL=your_email@gmail.com
SENDER_EMAIL_PASSWORD=your_app_password

# SMS (Vonage)
VONAGE_API_KEY=your_vonage_api_key
VONAGE_API_SECRET=your_vonage_api_secret
VONAGE_FROM_NUMBER=your_vonage_from_number

# JWT
JWT_ACCESS_SECRET=your_jwt_secret
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_SECRET=your_refresh_secret
JWT_REFRESH_EXPIRY=7d

# Frontend URL for CORS
FRONTEND_URL=http://localhost:3000
```

## Installation and Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Set Environment Variables**
   Create a `.env` file with the required environment variables

3. **Database Setup**
   The system will automatically create required tables on startup

4. **Start the Server**
   ```bash
   npm run dev
   ```

## Security Features

- **JWT Authentication**: Secure token-based authentication
- **Role-based Access Control**: Different permissions for different user roles
- **Society Isolation**: Users can only access alerts from their own society
- **Input Validation**: Comprehensive input validation and sanitization
- **SQL Injection Protection**: Parameterized queries
- **CORS Configuration**: Configurable cross-origin resource sharing

## Monitoring and Health Checks

- **Health Endpoint**: `/health` - Overall system health
- **WebSocket Stats**: `/websocket/stats` - Connection statistics
- **Cron Jobs**: Automatic cleanup and health checks
- **Communication Logs**: Track all notification attempts
- **Error Logging**: Comprehensive error logging and monitoring

## Performance Considerations

- **Database Indexes**: Optimized database queries with proper indexing
- **Connection Pooling**: Efficient database connection management
- **Asynchronous Processing**: Non-blocking notification sending
- **WebSocket Optimization**: Efficient real-time communication
- **Scheduled Jobs**: Background processing for maintenance tasks

## Troubleshooting

### Common Issues

1. **Email Not Sending**
   - Check SMTP credentials
   - Verify email service configuration
   - Check communication logs for errors

2. **SMS Not Sending**
   - Verify Vonage credentials
   - Check phone number format
   - Review SMS logs

3. **WebSocket Connection Issues**
   - Check CORS configuration
   - Verify frontend URL
   - Check authentication data

4. **Database Connection Issues**
   - Verify database credentials
   - Check database server status
   - Review connection pool settings

### Debug Mode

Enable debug logging by setting environment variable:
```bash
DEBUG=true
```

## Future Enhancements

- **Mobile Push Notifications**: Firebase Cloud Messaging integration
- **Advanced Scheduling**: Recurring alerts and complex scheduling
- **Template Management**: Dynamic alert templates
- **Analytics Dashboard**: Advanced reporting and analytics
- **Multi-language Support**: Internationalization support
- **Advanced Filtering**: More sophisticated alert filtering options

## Support

For technical support or questions about the Alert Broadcasting System, please refer to the main project documentation or contact the development team.
