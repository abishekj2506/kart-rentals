// app/screens/Confirmation.screen.tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import firestore from '@react-native-firebase/firestore';
import { colors } from '../theme/colors';
import { scale } from '../theme/scale';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { NavigatorParamList } from '../navigators/navigation-route';

type Props = NativeStackScreenProps<NavigatorParamList, 'ConfirmationScreen'>;
const { width } = Dimensions.get('window');

type BookingCart = {
  id: string;
  brand?: string;
  model?: string;
  image_url?: string;
  daily_price?: number;
  qty?: number;
};

type BookingDoc = {
  customerId?: string;
  createdAt?: any;
  status?: string;
  sessionId?: string;
  partialBooking?: {
    dates?: { start?: any; end?: any };
    carts?: BookingCart[] | string[]; // either array of cart ids or array of cart objects
    totals?: { base?: number; tax?: number; deposit?: number; total?: number };
  };
  [k: string]: any;
};

export default function ConfirmationScreen({ route, navigation }: Props) {
  // Expect bookingId from previous screen (Payment -> Confirmation)
  const { bookingId } = (route.params || {}) as { bookingId?: string };

  const [booking, setBooking] = useState<BookingDoc | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!bookingId) {
      Alert.alert('Missing booking', 'No booking id supplied.');
      setLoading(false);
      return;
    }

    const unsub = firestore()
      .collection('bookings')
      .doc(bookingId)
      .onSnapshot(
        snap => {
          if (!snap.exists) {
            setBooking(null);
            setLoading(false);
            return;
          }
          setBooking(snap.data() as BookingDoc);
          setLoading(false);
        },
        err => {
          console.error('❌ booking subscription error', err);
          Alert.alert('Error', 'Could not load booking.');
          setLoading(false);
        }
      );

    return () => unsub();
  }, [bookingId]);

  const fmtDate = (val: any) => {
    if (!val) return '';
    try {
      if (typeof val === 'string') return val;
      if (val.toDate && typeof val.toDate === 'function') {
        return val.toDate().toLocaleString();
      }
      if (val instanceof Date) return val.toLocaleString();
      return String(val);
    } catch (e) {
      return String(val);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primaryDark} />
      </View>
    );
  }

  if (!booking) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: colors.textDark }}>Booking not found.</Text>
        <TouchableOpacity style={{ marginTop: 16 }} onPress={() => navigation.navigate('LandingScreen')}>
          <Text style={{ color: colors.primaryDark }}>Back to home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const partial = booking.partialBooking || {};
  const carts = Array.isArray(partial.carts)
    ? // carts might be array of ids or array of objects
      (partial.carts as BookingCart[]).map(c =>
        typeof c === 'string'
          ? ({ id: c } as BookingCart)
          : c
      )
    : [];

  // Prefer totals from booking if provided, otherwise compute
  const totals = partial.totals || {};
  const computedBase =
    carts.reduce((s, c) => s + (Number(c.daily_price || 0) * (Number(c.qty || 1) || 1)), 0) || 0;
  const base = typeof totals.base === 'number' ? totals.base : computedBase;
  const tax = typeof totals.tax === 'number' ? totals.tax : +(base * 0.1).toFixed(2);
  const deposit = typeof totals.deposit === 'number' ? totals.deposit : 50;
  const total = typeof totals.total === 'number' ? totals.total : +(base + tax + deposit).toFixed(2);

  const startStr = fmtDate(partial.dates?.start);
  const endStr = fmtDate(partial.dates?.end);
  const createdStr = fmtDate(booking.createdAt);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Title */}
        <Text style={styles.title}>Booking Confirmation</Text>

        {/* Instructions Box */}
        <View style={styles.instructionBox}>
          <Text style={styles.instructionText}>
            Please present this code at pickup.{'\n'}
            Pickup address: 123 Golf Course Road
          </Text>
        </View>

        {/* QR Code */}
        <View style={styles.qrWrapper}>
          <Image
            // Keep placeholder; you can generate a QR from `bookingId` / booking data later
            source={require('../assets/images/qr-placeholder.jpeg')}
            style={styles.qrImage}
          />
        </View>

        {/* Booking Summary */}
        <View style={styles.summaryBox}>
          <Text style={[styles.summaryText, { fontWeight: '600' }]}>Reference: {bookingId}</Text>
          <Text style={styles.summaryText}>Status: {String(booking.status ?? 'confirmed')}</Text>
          {createdStr ? <Text style={styles.summaryText}>Created: {createdStr}</Text> : null}
          {startStr || endStr ? (
            <Text style={styles.summaryText}>{`${startStr}${startStr && endStr ? ' → ' : ''}${endStr}`}</Text>
          ) : null}
          <View style={{ height: scale(8) }} />

          {/* carts */}
          {carts.length === 0 ? (
            <Text style={styles.summaryText}>No carts listed in booking</Text>
          ) : (
            carts.map((c) => (
              <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: scale(8) }}>
                <Image
                  source={c.image_url ? { uri: c.image_url } : require('../assets/images/kart1.png')}
                  style={{ width: scale(64), height: scale(44), borderRadius: 6, backgroundColor: colors.grayLightest }}
                />
                <View style={{ marginLeft: scale(8), flex: 1 }}>
                  <Text style={[styles.summaryText, { fontWeight: '600' }]}>{`${c.brand ?? ''} ${c.model ?? ''}`.trim()}</Text>
                  <Text style={styles.summaryText}>{`Qty: ${c.qty ?? 1} • $${(Number(c.daily_price) || 0).toFixed(2)} / day`}</Text>
                </View>
              </View>
            ))
          )}

          <View style={{ height: scale(8) }} />

          <View style={{ borderTopWidth: 1, borderTopColor: '#eee', paddingTop: scale(8) }}>
            <Text style={styles.summaryText}>{`Base: $${base.toFixed(2)}`}</Text>
            <Text style={styles.summaryText}>{`Service tax (10%): $${tax.toFixed(2)}`}</Text>
            <Text style={styles.summaryText}>{`Deposit: $${deposit.toFixed(2)}`}</Text>
            <Text style={[styles.summaryText, { fontWeight: '700', marginTop: scale(8) }]}>{`Total: $${total.toFixed(2)}`}</Text>
          </View>
        </View>

        {/* Share Row */}
        <Text style={styles.shareLabel}>Share</Text>
        <View style={styles.shareRow}>
          {['whatsapp', 'facebook', 'twitter', 'email'].map((icon) => (
            <TouchableOpacity key={icon} style={styles.iconBtn}>
              <MaterialCommunityIcons
                name={icon}
                size={scale(28)}
                color={colors.primaryDark}
              />
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.copyRow} onPress={() => {
            // simple copy shortcut; you could integrate Clipboard if desired
            Alert.alert('Copied', `Booking reference ${bookingId} copied to clipboard (not implemented).`);
          }}>
            <MaterialCommunityIcons
              name="link"
              size={scale(20)}
              color={colors.textDark}
            />
            <Text style={styles.copyText}>Copy link</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
      {/* Pagination dots */}
      <View style={styles.dotsRow}>
        {[0,1,2,3,4,5].map(i => (
          <View
            key={i}
            style={[
              styles.dot,
              i === 5 && { backgroundColor: colors.grayLight }, // last dot inactive
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor: colors.backgroundLight },
  scroll: { padding: scale(16), alignItems: 'center' },
  title: {
    fontSize: scale(20),
    fontWeight: '600',
    color: colors.primaryDark,
    alignSelf: 'flex-start',
    marginBottom: scale(12),
  },
  instructionBox: {
    width: '100%',
    backgroundColor: colors.white,
    borderRadius: scale(8),
    padding: scale(12),
    marginBottom: scale(16),
  },
  instructionText: {
    fontSize: scale(14),
    color: colors.textDark,
    lineHeight: scale(18),
  },
  qrWrapper: {
    width: width * 0.6,
    height: width * 0.6,
    marginBottom: scale(16),
  },
  qrImage: {
    flex:1,
    width: null,
    height: null,
    resizeMode: 'contain',
  },
  summaryBox: {
    width: '100%',
    backgroundColor: colors.white,
    borderRadius: scale(8),
    padding: scale(12),
    marginBottom: scale(16),
  },
  summaryText: {
    fontSize: scale(14),
    color: colors.textDark,
    marginBottom: scale(4),
  },
  shareLabel: {
    alignSelf: 'flex-start',
    fontSize: scale(16),
    fontWeight: '600',
    color: colors.primaryDark,
    marginBottom: scale(8),
  },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: scale(16),
  },
  iconBtn: {
    marginRight: scale(12),
  },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
  },
  copyText: {
    marginLeft: scale(4),
    fontSize: scale(14),
    color: colors.textDark,
  },
  dotsRow: {
    flexDirection:'row',
    justifyContent:'center',
    paddingBottom: scale(16),
  },
  dot: {
    width: scale(8),
    height: scale(8),
    borderRadius: scale(4),
    backgroundColor: colors.primaryDark,
    marginHorizontal: scale(4),
  },
});
