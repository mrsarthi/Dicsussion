import { PushNotifications } from '@capacitor/push-notifications';
import { platform } from './platformService';

/**
 * Initializes Push Notifications for Android
 * @param {function} onTokenReceived Callback with the FCM token string
 * @param {function} onNotificationReceived Callback with the notification payload
 */
export async function initPushNotifications(onTokenReceived, onNotificationReceived) {
    if (!platform.isCapacitor) {
        console.log('Push notifications not supported on this platform');
        return false;
    }

    try {
        // Request Permission
        let permStatus = await PushNotifications.checkPermissions();
        
        if (permStatus.receive === 'prompt') {
            permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
            console.warn('User denied push notification permissions');
            return false;
        }

        // Add Listeners
        await PushNotifications.removeAllListeners();

        PushNotifications.addListener('registration', (token) => {
            console.log('Push registration success, token:', token.value);
            if (onTokenReceived) {
                onTokenReceived(token.value);
            }
        });

        PushNotifications.addListener('registrationError', (error) => {
            console.error('Push registration error:', error);
        });

        PushNotifications.addListener('pushNotificationReceived', (notification) => {
            console.log('Push notification received', notification);
            if (onNotificationReceived) {
                onNotificationReceived(notification);
            }
        });

        PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
            console.log('Push notification action performed', action);
            // Example: navigate to chat if action.notification.data.address is present
        });

        // Register with Google FCM
        await PushNotifications.register();
        console.log('PushNotifications.register() called');
        
        return true;
    } catch (err) {
        console.error('Failed to initialize push notifications:', err);
        return false;
    }
}
