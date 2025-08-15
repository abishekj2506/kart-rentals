// app/screens/Review.screen.tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../theme/colors';
import { scale } from '../theme/scale';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { NavigatorParamList } from '../navigators/navigation-route';

type Props = NativeStackScreenProps<NavigatorParamList, 'ReviewScreen'>;
const { width } = Dimensions.get('window');

type Cart = {
  id: string;
  brand: string;
  model: string;
  image_url: string;
  daily_price: number;
  qty: number;
  time: string;
};

type Profile = {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  driverLicense?: string;
  idDocument?: string;
};

export default function ReviewScreen({ route, navigation }: Props) {
  const { sessionId } = route.params as { sessionId: string };
  const [carts, setCarts] = useState<Cart[]>([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        // 1) Fetch the session
        const snap = await firestore().collection('sessions').doc(sessionId).get();
        if (!snap.exists) {
          throw new Error('Session not found');
        }

        const data = snap.data() as any;
        const partial = data.partialBooking;
        if (!partial || !Array.isArray(partial.carts)) {
          throw new Error('No carts in this session yet');
        }

        const cartIds: string[] = partial.carts;

        // 2) Fetch each cart’s details
        const fetched: Cart[] = await Promise.all(
          cartIds.map(async (id: string) => {
            const cd = await firestore().collection('carts').doc(id).get();
            if (!cd.exists) throw new Error(`Cart ${id} not found`);
            const d = cd.data()!;
            // normalize price
            const dailyPrice = parseFloat(String(d.daily_price ?? '0').replace(/[^0-9.-]+/g, '')) || 0;
            // format time if available
            let timeStr = '—';
            try {
              if (partial.dates && partial.dates.start && partial.dates.end) {
                // Firestore Timestamp: use toDate if available
                const s = partial.dates.start.toDate ? partial.dates.start.toDate() : new Date(partial.dates.start);
                const e = partial.dates.end.toDate ? partial.dates.end.toDate() : new Date(partial.dates.end);
                timeStr = `${s.toLocaleDateString()} · ${s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} → ${e.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
              }
            } catch (err) {
              // ignore formatting errors — keep fallback
            }

            return {
              id: cd.id,
              brand: d.brand,
              model: d.model,
              image_url: d.image_url,
              daily_price: dailyPrice,
              qty: 1,
              time: timeStr,
            } as Cart;
          })
        );

        setCarts(fetched);

        // 3) load customer profile (from session.customerId or signed-in user)
        const customerId = data.customerId ?? auth().currentUser?.uid;
        if (customerId) {
          const custSnap = await firestore().collection('customers').doc(customerId).get();
          if (custSnap.exists) {
            const cd = custSnap.data() as any;
            setProfile({
              firstName: cd.firstName ?? cd.first_name ?? '',
              lastName: cd.lastName ?? cd.last_name ?? '',
              phone: cd.phone ?? cd.phoneNumber ?? cd.phone_number ?? '',
              email: cd.email ?? '',
              address: cd.address ?? '',
              city: cd.city ?? '',
              state: cd.state ?? '',
              zipcode: cd.zipcode ?? cd.postalCode ?? '',
              driverLicense: cd.driverLicense ?? cd.dln ?? '',
              idDocument: cd.identityDocument ?? cd.idDocument ?? '',
            });
          }
        }
      } catch (err: any) {
        console.error('❌ Review load error', err);
        Alert.alert('Error', err.message || 'Failed to load review data');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [sessionId]);

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={colors.primaryDark} />
      </View>
    );
  }

  // compute fees
  const base = carts.reduce((sum, c) => sum + c.daily_price * c.qty, 0);
  const tax = +(base * 0.1).toFixed(2);
  const deposit = 50;
  const total = +(base + tax + deposit).toFixed(2);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Profile */}
        <Text style={styles.sectionTitle}>Profile</Text>

        <View style={styles.card}>
          <Text style={styles.profileText}>
            {profile ? `${profile.firstName ?? ''} ${profile.lastName ?? ''}` : 'Guest User'}
            {profile?.phone ? ` • ${profile.phone}` : ''}
            {profile?.email ? ` • ${profile.email}` : ''}
          </Text>

          {profile?.address ? (
            <Text style={styles.profileText}>{profile.address}{profile.city ? ` • ${profile.city}` : ''}{profile.state ? `, ${profile.state}` : ''}</Text>
          ) : null}

          {profile?.driverLicense ? (
            <Text style={styles.profileText}>{`Driver’s License: ${profile.driverLicense}`}</Text>
          ) : null}

          {profile?.idDocument ? (
            <Text style={styles.profileText}>{`Identity Document: ${profile.idDocument}`}</Text>
          ) : null}

          {/* <TouchableOpacity style={styles.editRow} onPress={() => {
            // navigate to payment/profile screen for edits if you have one
            navigation.navigate('PaymentScreen', { sessionId });
          }}>
            <MaterialCommunityIcons name="pencil" size={scale(16)} color={colors.primaryDark}/>
            <Text style={[styles.profileText, { color: colors.primaryDark, marginLeft: scale(4) }]}>Edit</Text>
          </TouchableOpacity> */}
        </View>

        {/* Review booking */}
        <Text style={styles.sectionTitle}>Review booking</Text>
        {carts.map((c) => (
          <View key={c.id} style={styles.card}>
            <View style={styles.reviewRow}>
              <Image source={{ uri: c.image_url }} style={styles.kartThumb} />
              <View style={{ flex: 1, marginLeft: scale(12) }}>
                <Text style={styles.reviewText}>{`${c.brand} ${c.model}`}</Text>
                <Text style={styles.reviewText}>{`Qty: ${c.qty} × $${c.daily_price}`}</Text>
                <Text style={styles.reviewText}>{`${c.time}`}</Text>
              </View>
              <View style={styles.qtyRow}>
                <Text style={styles.reviewText}>−</Text>
                <Text style={styles.reviewText}>{c.qty}</Text>
                <Text style={styles.reviewText}>+</Text>
              </View>
            </View>
          </View>
        ))}

        {/* Taxes and Fees */}
        <Text style={styles.sectionTitle}>Taxes and Fees</Text>
        <View style={styles.card}>
          <View style={styles.feeRow}>
            <Text style={styles.feeLabel}>{`Base rental (${carts.length} day${carts.length>1?'s':''})`}</Text>
            <Text style={styles.feeValue}>{`$${base.toFixed(2)}`}</Text>
          </View>
          <View style={styles.feeRow}>
            <Text style={styles.feeLabel}>Service tax (10%)</Text>
            <Text style={styles.feeValue}>{`$${tax}`}</Text>
          </View>
          <View style={styles.feeRow}>
            <Text style={styles.feeLabel}>Kart deposit</Text>
            <View style={styles.infoRow}>
              <Text style={styles.feeValue}>{`$${deposit}`}</Text>
              <MaterialCommunityIcons name="information" size={scale(14)} color={colors.grayLight} />
            </View>
          </View>
          <View style={[styles.feeRow, { marginTop: scale(8) }]}>
            <Text style={[styles.feeLabel, { fontWeight: '600' }]}>Total</Text>
            <Text style={[styles.feeValue, { fontWeight: '600' }]}>{`$${total}`}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Confirm button */}
      <TouchableOpacity
        style={styles.confirmBtn}
        onPress={() => navigation.navigate('PaymentScreen', { sessionId })}
      >
        <Text style={styles.confirmText}>Confirm</Text>
      </TouchableOpacity>

      {/* Pagination dots */}
      <View style={styles.dotsRow}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === 3 && { backgroundColor: colors.grayLight }, // last page inactive
            ]}
          />
        ))}
      </View>

      {/* Back arrow */}
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
        <MaterialCommunityIcons name="chevron-left" size={scale(24)} color={colors.textDark}/>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundLight },
  loader: { flex:1, alignItems:'center', justifyContent:'center' },
  scroll: { padding: scale(16), paddingBottom: scale(100) },
  sectionTitle: {
    fontSize: scale(16),
    fontWeight: '600',
    color: colors.primaryDark,
    marginVertical: scale(8),
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: scale(8),
    padding: scale(12),
    marginBottom: scale(12),
    width: '100%',
  },
  profileText: { fontSize: scale(12), color: colors.textDark, marginBottom: scale(4) },
  editRow: { flexDirection: 'row', alignItems: 'center', marginTop: scale(4) },
  reviewRow: { flexDirection: 'row', alignItems: 'center' },
  kartThumb: { width: scale(60), height: scale(40), backgroundColor: colors.grayLightest },
  reviewText: { fontSize: scale(12), color: colors.textDark, marginBottom: scale(2) },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: scale(50),
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: scale(4),
  },
  feeLabel: { fontSize: scale(12), color: colors.textDark },
  feeValue: { fontSize: scale(12), color: colors.textDark },
  infoRow: { flexDirection: 'row', alignItems: 'center' },
  confirmBtn: {
    position: 'absolute',
    bottom: scale(50),
    left: scale(16),
    right: scale(16),
    backgroundColor: colors.primaryDark,
    paddingVertical: scale(14),
    borderRadius: scale(8),
    alignItems: 'center',
  },
  confirmText: { color: colors.white, fontSize: scale(16), fontWeight: '600' },
  dotsRow: {
    position: 'absolute',
    bottom: scale(16),
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  dot: {
    width: scale(8),
    height: scale(8),
    borderRadius: scale(4),
    backgroundColor: colors.primaryDark,
    marginHorizontal: scale(4),
  },
  backBtn: {
    position: 'absolute',
    top: scale(16),
    left: scale(16),
  },
});
