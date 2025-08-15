// app/screens/Payment.screen.tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { colors } from '../theme/colors';
import { scale } from '../theme/scale';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { NavigatorParamList } from '../navigators/navigation-route';

type Props = NativeStackScreenProps<NavigatorParamList, 'PaymentScreen'>;
const { width } = Dimensions.get('window');

export default function PaymentScreen({ route, navigation }: Props) {
  // Expect sessionId to be passed in route.params
  const { sessionId } = (route.params || {}) as { sessionId?: string };

  // personal profile state (customer doc)
  const [personal, setPersonal] = useState({
    firstName: '',
    lastName: '',
    dob: '',
    address: '',
    city: '',
    state: '',
    country: '',
    zipcode: '',
  });

  // payment fields (we'll only prefill non-sensitive parts)
  const [cardMasked, setCardMasked] = useState(''); // e.g. **** **** **** 4242
  const [cardBrand, setCardBrand] = useState(''); // e.g. Visa
  const [cardExpiry, setCardExpiry] = useState(''); // MM/YY or similar

  // input fields for entering a new card (if user wants to enter)
  const [cardNumberInput, setCardNumberInput] = useState('');
  const [nameOnCardInput, setNameOnCardInput] = useState('');
  const [expiryInput, setExpiryInput] = useState('');
  const [cvvInput, setCvvInput] = useState('');

  const [saveCard, setSaveCard] = useState(false);
  const [agreements, setAgreements] = useState({
    rental: false,
    rules: false,
  });

  // loading states
  const [fetching, setFetching] = useState(true); // loading existing data
  const [submitting, setSubmitting] = useState(false); // booking submit

  const onChange = (field: keyof typeof personal, value: string) =>
    setPersonal(p => ({ ...p, [field]: value }));

  useEffect(() => {
    // fetch customer profile and most recent saved payment (if any)
    const uid = auth().currentUser?.uid;
    if (!uid) {
      setFetching(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
  try {
    const db = firestore();

    // 1) fetch customer doc
    const custSnap = await db.collection('customers').doc(uid).get();
    if (!cancelled && custSnap.exists) {
      const cd = custSnap.data() as any;
      setPersonal(p => ({
        ...p,
        firstName: cd.firstName ?? p.firstName,
        lastName: cd.lastName ?? p.lastName,
        dob: cd.dob ?? p.dob,
        address: cd.address ?? p.address,
        city: cd.city ?? p.city,
        state: cd.state ?? p.state,
        country: cd.country ?? p.country,
        zipcode: cd.zipcode ?? p.zipcode,
      }));
    }

    // 2) fetch most recent saved payment for this customer
    // Try the efficient server-side query first; if Firestore requires a composite index,
    // fall back to a simpler query and sort client-side.
    let paymentDocData: any | null = null;

    try {
      // preferred: server-side ordering + limit(1)
      const paymentsQuery = await db
        .collection('payments')
        .where('customerId', '==', uid)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();

      if (!paymentsQuery.empty) {
        paymentDocData = paymentsQuery.docs[0].data();
      }
    } catch (err: any) {
      // Firestore will throw `failed-precondition` / message that an index is required.
      // Fallback: query by customerId only and sort locally by createdAt.
      console.warn('Payments orderBy() failed, falling back to client-side sort', err);

      // detect index error heuristically
      const needsIndex =
        err &&
        (err.code === 'failed-precondition' ||
          (typeof err.message === 'string' && err.message.toLowerCase().includes('requires an index')));

      if (needsIndex) {
        const qs = await db.collection('payments').where('customerId', '==', uid).get();
        if (!qs.empty) {
          const mapped = qs.docs.map(d => ({ id: d.id, data: d.data() as any }));
          mapped.sort((a, b) => {
            // handle both Firestore Timestamp and plain Date fallback
            const ta = a.data.createdAt?.toMillis?.() ?? (a.data.createdAt ? new Date(a.data.createdAt).getTime() : 0);
            const tb = b.data.createdAt?.toMillis?.() ?? (b.data.createdAt ? new Date(b.data.createdAt).getTime() : 0);
            return tb - ta;
          });
          paymentDocData = mapped[0].data;
        }
      } else {
        // unknown error — rethrow so outer catch will handle it
        throw err;
      }
    }

    // If we found a payment doc, use its non-sensitive fields to prefill UI
    if (!cancelled && paymentDocData) {
      const pdoc = paymentDocData as any;
      if (pdoc.last4) {
        setCardMasked(`**** **** **** ${String(pdoc.last4)}`);
      } else if (pdoc.masked) {
        setCardMasked(pdoc.masked);
      }
      if (pdoc.brand) setCardBrand(pdoc.brand);
      if (pdoc.expiry) setCardExpiry(pdoc.expiry);
      // Auto-toggle save card if a saved card exists
      setSaveCard(true);
    }
  } catch (err) {
    console.error('❌ Payment screen load error', err);
  } finally {
    if (!cancelled) setFetching(false);
  }
};


    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleConfirm = async () => {
    // simple validation
    const uid = auth().currentUser?.uid;
    if (!uid) {
      return Alert.alert('Not signed in', 'Please sign in / register first.');
    }
    if (!sessionId) {
      return Alert.alert('Missing session', 'No active session found.');
    }
    if (!personal.firstName.trim() || !personal.lastName.trim()) {
      return Alert.alert('Missing info', 'Please enter your full name.');
    }
    if (!agreements.rental || !agreements.rules) {
      return Alert.alert('Need agreements', 'Please accept the rental agreement and rules.');
    }

    setSubmitting(true);

    try {
      const db = firestore();

      // 1) Read session
      const sessionSnap = await db.collection('sessions').doc(sessionId).get();
      if (!sessionSnap.exists) throw new Error('Session not found');
      const sessionData = sessionSnap.data() as any;

      // Guard: partialBooking must exist
      const partial = sessionData.partialBooking;
      if (!partial || !Array.isArray(partial.carts) || partial.carts.length === 0) {
        throw new Error('No carts selected in session.');
      }

      // 2) Load cart docs to calculate total
      const cartDocs = await Promise.all(
        partial.carts.map((cartId: string) => db.collection('carts').doc(cartId).get())
      );

      // compute base total (assumes daily_price in Firestore is a string like "$72" — sanitize)
      let base = 0;
      const cartsForBooking: any[] = [];
      cartDocs.forEach(cd => {
        if (!cd.exists) return;
        const d = cd.data() as any;
        const raw = String(d.daily_price ?? '0');
        const price = parseFloat(raw.replace(/[^0-9.-]+/g, '')) || 0;
        const qty = 1;
        base += price * qty;
        cartsForBooking.push({
          id: cd.id,
          brand: d.brand,
          model: d.model,
          image_url: d.image_url,
          daily_price: price,
          qty,
        });
      });

      const tax = +(base * 0.10).toFixed(2);
      const deposit = 50; // static
      const total = +(base + tax + deposit).toFixed(2);

      // 3) Prepare writes (use batch)
      const batch = db.batch();

      // 3a) Upsert customer profile (merge)
      const customerRef = db.collection('customers').doc(uid);
      batch.set(
        customerRef,
        {
          firstName: personal.firstName.trim(),
          lastName: personal.lastName.trim(),
          dob: personal.dob || null,
          address: personal.address || null,
          city: personal.city || null,
          state: personal.state || null,
          country: personal.country || null,
          zipcode: personal.zipcode || null,
          updatedAt: firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // 3b) Create booking document (finalized)
      const bookingsRef = db.collection('bookings').doc(); // auto-id
      const bookingPayload = {
        customerId: uid,
        createdAt: firestore.FieldValue.serverTimestamp(),
        status: 'confirmed',
        partialBooking: {
          ...partial,
          carts: cartsForBooking,
          totals: {
            base,
            tax,
            deposit,
            total,
          },
        },
        sessionId,
      };
      batch.set(bookingsRef, bookingPayload);

      // 3c) Update the session doc to indicate it's booked & reference booking id
      const sessionRef = db.collection('sessions').doc(sessionId);
      batch.update(sessionRef, {
        status: 'booked',
        bookingRef: bookingsRef.id,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });

      // 3d) Create payment doc if user asked to save payment details
      // NOTE: Real Stripe integration must be done server-side.
      if (saveCard) {
        const paymentsRef = db.collection('payments').doc();
        const paymentPayload = {
          customerId: uid,
          sessionId,
          bookingId: bookingsRef.id,
          amount: total,
          currency: 'USD',
          method: cardBrand || 'card', // placeholder
          status: 'saved',
          stripeCustomerId: null,
          paymentIntentId: null,
          // non-sensitive fields for display:
          last4: cardMasked ? cardMasked.slice(-4) : (cardNumberInput ? cardNumberInput.slice(-4) : null),
          brand: cardBrand || null,
          expiry: expiryInput || cardExpiry || null,
          createdAt: firestore.FieldValue.serverTimestamp(),
        };
        batch.set(paymentsRef, paymentPayload);
      }

      // 4) Commit batch
      await batch.commit();

      // 5) Navigate to confirmation and pass booking id
      navigation.navigate('ConfirmationScreen', { bookingId: bookingsRef.id });
    } catch (err: any) {
      console.error('❌ Payment/booking error', err);
      Alert.alert('Booking failed', err.message || 'Please try again');
    } finally {
      setSubmitting(false);
    }
  };

  if (fetching) {
    return (
      <View style={{flex:1,justifyContent:'center',alignItems:'center',backgroundColor:colors.backgroundLight}}>
        <ActivityIndicator size="large" color={colors.primaryDark} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Personal Details */}
        <Text style={styles.sectionTitle}>Personal Details *</Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.flex1, { marginRight: scale(8) }]}
            placeholder="First Name"
            value={personal.firstName}
            onChangeText={v => onChange('firstName', v)}
          />
          <TextInput
            style={[styles.input, styles.flex1, { marginLeft: scale(8) }]}
            placeholder="Last Name"
            value={personal.lastName}
            onChangeText={v => onChange('lastName', v)}
          />
          <TouchableOpacity style={[styles.dateInput, { marginLeft: scale(8) }]}>
            <Text style={styles.placeholder}>{personal.dob ? personal.dob : 'DOB'}</Text>
            <MaterialCommunityIcons
              name="calendar"
              size={scale(20)}
              color={colors.grayLight}
            />
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.input}
          placeholder="Address"
          value={personal.address}
          onChangeText={v => onChange('address', v)}
        />

        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.flex1, { marginRight: scale(8) }]}
            placeholder="City"
            value={personal.city}
            onChangeText={v => onChange('city', v)}
          />
          <TextInput
            style={[styles.input, styles.flex1, { marginLeft: scale(8) }]}
            placeholder="State"
            value={personal.state}
            onChangeText={v => onChange('state', v)}
          />
        </View>

        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.flex1, { marginRight: scale(8) }]}
            placeholder="Country"
            value={personal.country}
            onChangeText={v => onChange('country', v)}
          />
          <TextInput
            style={[styles.input, styles.flex1, { marginLeft: scale(8) }]}
            placeholder="Zipcode"
            value={personal.zipcode}
            onChangeText={v => onChange('zipcode', v)}
          />
        </View>

        {/* Uploads */}
        <Text style={styles.sectionTitle}>Upload Identity Document</Text>
        <TouchableOpacity style={styles.uploadRow}>
          <MaterialCommunityIcons
            name="file-upload-outline"
            size={scale(24)}
            color={colors.primaryDark}
          />
          <Text style={styles.uploadText}>(Tap to upload)</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Upload Driver’s License</Text>
        <TouchableOpacity style={styles.uploadRow}>
          <MaterialCommunityIcons
            name="file-upload-outline"
            size={scale(24)}
            color={colors.primaryDark}
          />
          <Text style={styles.uploadText}>(Tap to upload)</Text>
        </TouchableOpacity>

        {/* Payment Details */}
        <Text style={styles.sectionTitle}>Payment Details *</Text>
        <View style={styles.socialRow}>
          <TouchableOpacity style={styles.socialBtn}>
            <MaterialCommunityIcons
              name="google-pay"
              size={scale(24)}
              color={colors.primaryDark}
            />
            <Text style={styles.socialText}>Google Pay</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.socialBtn}>
            <MaterialCommunityIcons
              name="apple"
              size={scale(24)}
              color={colors.primaryDark}
            />
            <Text style={styles.socialText}>Apple Pay</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.orText}>or</Text>

        {/* If we have a saved card, show masked view; still allow entering new card below */}
        {cardMasked ? (
          <View style={[styles.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
            <View>
              <Text style={{ fontSize: 14, color: colors.textDark }}>{cardBrand ? `${cardBrand}` : 'Saved card'}</Text>
              <Text style={{ fontSize: 14, color: colors.textDark }}>{cardMasked} {cardExpiry ? `• ${cardExpiry}` : ''}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ marginRight: scale(8) }}>Use</Text>
              <Switch value={saveCard} onValueChange={setSaveCard} trackColor={{ true: colors.primaryDark, false: colors.grayLightest }} thumbColor={colors.white} />
            </View>
          </View>
        ) : null}

        {/* New card inputs (user may still enter a new card) */}
        <TextInput
          style={styles.input}
          placeholder={cardMasked ? 'Enter new card or leave masked card selected' : 'Card number'}
          value={cardNumberInput}
          onChangeText={setCardNumberInput}
          keyboardType="number-pad"
        />

        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.flex1, { marginRight: scale(8) }]}
            placeholder="Name on Card"
            value={nameOnCardInput}
            onChangeText={setNameOnCardInput}
          />
          <TouchableOpacity style={[styles.dateInput, { marginLeft: scale(8) }]}>
            <Text style={styles.placeholder}>{expiryInput || (cardExpiry ? cardExpiry : 'Expiry date')}</Text>
            <MaterialCommunityIcons
              name="calendar"
              size={scale(20)}
              color={colors.grayLight}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.row}>
          <TextInput
            style={[styles.input, { flex: 0.4, marginRight: scale(8) }]}
            placeholder="CVV"
            value={cvvInput}
            onChangeText={setCvvInput}
            secureTextEntry
            keyboardType="number-pad"
          />
          <View style={[styles.input, { flex: 0.6, flexDirection: 'row', alignItems: 'center' }]}>
            <MaterialCommunityIcons name="credit-card" size={scale(24)} color={colors.grayLight} />
            <View style={{ flex: 1 }} />
            <Text>Save card details</Text>
            <Switch
              value={saveCard}
              onValueChange={setSaveCard}
              trackColor={{ true: colors.primaryDark, false: colors.grayLightest }}
              thumbColor={colors.white}
            />
          </View>
        </View>

        {/* Agreements */}
        <View style={styles.agreementRow}>
          <Switch
            value={agreements.rental}
            onValueChange={v => setAgreements(a => ({ ...a, rental: v }))}
            trackColor={{ true: colors.primaryDark, false: colors.grayLightest }}
            thumbColor={colors.white}
          />
          <Text style={styles.agreementText}>I have read the Rental Agreement</Text>
        </View>
        <View style={styles.agreementRow}>
          <Switch
            value={agreements.rules}
            onValueChange={v => setAgreements(a => ({ ...a, rules: v }))}
            trackColor={{ true: colors.primaryDark, false: colors.grayLightest }}
            thumbColor={colors.white}
          />
          <Text style={styles.agreementText}>I have read and understood the Rules</Text>
        </View>
      </ScrollView>

      {/* Confirm */}
      <TouchableOpacity
        style={styles.confirmBtn}
        onPress={handleConfirm}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.confirmText}>Confirm</Text>
        )}
      </TouchableOpacity>

      {/* Dots */}
      <View style={styles.dotsRow}>
        {[0, 1, 2, 3, 4].map(i => (
          <View
            key={i}
            style={[
              styles.dot,
              i === 4 ? { backgroundColor: colors.grayLight } : null,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundLight,
  },
  scroll: {
    padding: scale(16),
    paddingBottom: scale(140), // enough space for button & dots
  },

  sectionTitle: {
    fontSize: scale(16),
    fontWeight: '600',
    color: colors.primaryDark,
    marginTop: scale(24),
    marginBottom: scale(12),
  },

  row: {
    flexDirection: 'row',
    marginBottom: scale(16),
    alignItems: 'center',
  },
  flex1: {
    flex: 1,
  },
  input: {
    backgroundColor: colors.white,
    borderRadius: scale(6),
    paddingHorizontal: scale(12),
    paddingVertical: scale(14),
    fontSize: scale(14),
    color: colors.textDark,
    marginBottom: 0,
  },
  dateInput: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderRadius: scale(6),
    paddingHorizontal: scale(12),
    paddingVertical: scale(14),
  },
  placeholder: {
    color: colors.grayLight,
  },

  uploadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: scale(16),
  },
  uploadText: {
    marginLeft: scale(8),
    color: colors.textDark,
  },

  socialRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: scale(20),
  },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  socialText: {
    marginLeft: scale(6),
    color: colors.primaryDark,
  },
  orText: {
    textAlign: 'center',
    marginBottom: scale(20),
    color: colors.textDark,
  },

  agreementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: scale(16),
  },
  agreementText: {
    marginLeft: scale(8),
    flex: 1,
    color: colors.textDark,
    fontSize: scale(14),
  },

  confirmBtn: {
    position: 'absolute',
    bottom: scale(40),
    left: scale(16),
    right: scale(16),
    backgroundColor: colors.primaryDark,
    paddingVertical: scale(16),
    borderRadius: scale(8),
    alignItems: 'center',
  },
  confirmText: {
    color: colors.white,
    fontSize: scale(16),
    fontWeight: '600',
  },

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
});
