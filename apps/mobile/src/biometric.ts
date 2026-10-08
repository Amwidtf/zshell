import ReactNativeBiometrics from 'react-native-biometrics';
import {BiometricAuth} from '@zshell/core-shell';

const biometrics = new ReactNativeBiometrics({allowDeviceCredential: false});

export const biometricAuth: BiometricAuth = {
  async isAvailable() {
    try {
      const result = await biometrics.isSensorAvailable();
      return {
        available: !!result.available,
        type: result.biometryType,
      };
    } catch {
      return {available: false};
    }
  },
  async prompt(message: string) {
    try {
      const result = await biometrics.simplePrompt({
        promptMessage: message,
        cancelButtonText: '取消',
      });
      return !!result.success;
    } catch {
      return false;
    }
  },
};
