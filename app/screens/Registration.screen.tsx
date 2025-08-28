// app/screens/Registration.screen.tsx

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ImageBackground,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../theme/colors';
import { scale } from '../theme/scale';

export default function RegistrationScreen() {
  const [email, setEmail]       = useState('');
  const [phone, setPhone]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleContinue = async () => {
    if (!email || !phone) return;

    setLoading(true);
    try {
      // 1) Create the auth user
      const cred = await auth().createUserWithEmailAndPassword(email.trim(), phone.trim());
      const uid  = cred.user.uid;

      // 2) Write their profile into Firestore
      await firestore().doc(`customers/${uid}`).set({
        email:     email.trim(),
        phone:     phone.trim(),
        createdAt: firestore.FieldValue.serverTimestamp(),
      });

      // 3) Once both succeed, your root App.tsx onAuthStateChanged + profileExists
      //    logic will automatically switch into <AppNavigator /> for them.
    } catch (err: any) {
      console.error('❌ Registration error', err);
      Alert.alert('Registration failed', err.message ?? 'Please try again');
    } finally {
      setLoading(false);
    }
  };

  const disabled = !email.trim() || !phone.trim() || loading;

  return (
    <ImageBackground
      source={require('../assets/images/green-bg.jpg')}
      style={styles.bg}
      resizeMode="cover"
    >
      <View style={styles.container}>
        <Image
          source={require('../assets/images/brand/Logo_black.png')}
          style={styles.logo}
        />

        <Text style={styles.subtitle}>Create an account</Text>
        <Text style={styles.helperText}>
          Enter your email and phone number to sign up for this app
        </Text>

        <View style={styles.form}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={colors.grayLight}
            style={styles.input}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="Phone number"
            placeholderTextColor={colors.grayLight}
            style={styles.input}
            keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'phone-pad'}
          />

          <TouchableOpacity
            style={[styles.button, disabled && styles.buttonDisabled]}
            onPress={handleContinue}
            disabled={disabled}
          >
            {loading
              ? <ActivityIndicator color={colors.white} />
              : <Text style={styles.buttonText}>Continue</Text>
            }
          </TouchableOpacity>
        </View>

        <View style={styles.orRow}>
          <View style={styles.line} />
          <Text style={styles.orText}>or</Text>
          <View style={styles.line} />
        </View>

        <TouchableOpacity style={styles.socialButton}>
          <MaterialCommunityIcons
            name="google"
            size={scale(20)}
            color={colors.icon}
          />
          <Text style={styles.socialText}>Continue with Google</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.socialButton}>
          <MaterialCommunityIcons
            name="apple"
            size={scale(20)}
            color={colors.icon}
          />
          <Text style={styles.socialText}>Continue with Apple</Text>
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          By clicking continue, you agree to our{' '}
          <Text style={styles.link}>Terms of Service</Text> and{' '}
          <Text style={styles.link}>Privacy Policy</Text>
        </Text>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  logo: {
    width: '100%',
    height: 100,
    resizeMode: 'contain',
    alignSelf: 'center',
  },
  bg: {
    flex: 1,
    backgroundColor: colors.primaryDark,
  },
  container: {
    flex: 1,
    paddingHorizontal: scale(24),
    paddingTop: scale(60),
  },
  title: {
    fontSize: scale(24),
    fontWeight: '600',
    color: colors.white,
    textAlign: 'center',
    marginBottom: scale(32),
  },
  subtitle: {
    fontSize: scale(20),
    fontWeight: '500',
    color: colors.white,
    textAlign: 'center',
  },
  helperText: {
    fontSize: scale(14),
    color: colors.white,
    textAlign: 'center',
    marginBottom: scale(24),
    opacity: 0.9,
  },
  form: {
    marginBottom: scale(24),
  },
  input: {
    backgroundColor: colors.grayLightest,
    borderRadius: scale(8),
    paddingHorizontal: scale(16),
    paddingVertical: scale(12),
    fontSize: scale(16),
    marginBottom: scale(16),
    color: colors.textDark,
  },
  button: {
    backgroundColor: colors.buttonPrimary,
    borderRadius: scale(8),
    paddingVertical: scale(14),
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: colors.grayLight,
  },
  buttonText: {
    color: colors.white,
    fontSize: scale(16),
    fontWeight: '600',
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: scale(16),
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: colors.grayLight,
  },
  orText: {
    marginHorizontal: scale(8),
    color: colors.white,
    fontSize: scale(14),
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    paddingVertical: scale(12),
    borderRadius: scale(8),
    marginBottom: scale(12),
    justifyContent: 'center',
  },
  socialText: {
    marginLeft: scale(8),
    fontSize: scale(16),
    color: colors.textDark,
  },
  disclaimer: {
    fontSize: scale(12),
    color: colors.white,
    textAlign: 'center',
    marginTop: scale(16),
    paddingHorizontal: scale(8),
    opacity: 0.7,
  },
  link: {
    textDecorationLine: 'underline',
    fontWeight: '500',
  },
});