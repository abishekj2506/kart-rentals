// app/screens/Details.screen.tsx

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  Switch,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../theme/colors';
import { scale } from '../theme/scale';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { NavigatorParamList } from '../navigators/navigation-route';
import DateTimePicker from '@react-native-community/datetimepicker';

type Props = NativeStackScreenProps<NavigatorParamList, 'DetailsScreen'>;
const { width } = Dimensions.get('window');

type Cart = {
  id: string;
  brand: string;
  model: string;
  image_url: string;
  daily_price: string;
  passengers: string;
  battery: string;
  quantity: number;      // from session
};

export default function DetailsScreen({
  route,
  navigation
}: Props) {
  const { sessionId } = route.params as { sessionId: string };
  const [carts, setCarts] = useState<Cart[]>([]);
  const [loading, setLoading] = useState(true);

  const [pickUp, setPickUp] = useState<Date>(new Date());
  const [dropOff, setDropOff] = useState<Date>(new Date());
  const [showPicker, setShowPicker] = useState<{
    mode: 'date' | 'time';
    field: 'pickUp' | 'dropOff';
    visible: boolean;
  }>({ mode: 'date', field: 'pickUp', visible: false });
  const [sameForAll, setSameForAll] = useState(false);

  // 1️⃣ Load session → get partialBooking.carts
  useEffect(() => {
    const docRef = firestore().collection('sessions').doc(sessionId);

    docRef
      .get()
      .then(docSnap => {
        if (!docSnap.exists) {
          throw new Error('Session not found');
        }

        const data = docSnap.data() as any;

        // guard against missing partialBooking or carts
        const cartIds: string[] =
          Array.isArray(data.partialBooking?.carts)
            ? data.partialBooking.carts
            : [];

        // fetch each cart’s details in parallel
        return Promise.all(
          cartIds.map(id =>
            firestore()
              .collection('carts')
              .doc(id)
              .get()
              .then(cd => {
                if (!cd.exists) {
                  console.warn(`Cart ${id} not found`);
                  return null;
                }
                const d = cd.data()!;
                return {
                  id: cd.id,
                  brand: d.brand,
                  model: d.model,
                  image_url: d.image_url,
                  daily_price: d.daily_price,
                  passengers: d.passangers || d.passengers || 'N/A',
                  battery: d.battery,
                  quantity: 1, // default if you don't track per-cart qty in session
                } as Cart | null;
              })
          )
        );
      })
      .then(results => {
        // filter out any nulls (missing carts)
        const fetched = results.filter((c): c is Cart => c !== null);
        setCarts(fetched);
      })
      .catch(err => console.error('❌ Details load error', err))
      .finally(() => setLoading(false));
  }, [sessionId]);

  const toggleCart = (id: string) =>
    setCarts(cs =>
      cs.map(c => c.id === id ? { ...c, quantity: c.quantity > 0 ? 0 : 1 } : c)
    );

  const handleSave = () => {
    // parse pickUp/dropOff into timestamps; here we'll store as strings for simplicity
    firestore()
      .collection('sessions')
      .doc(sessionId)
      .update({
        'partialBooking.dates.start': pickUp,
        'partialBooking.dates.end': dropOff,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      })
      .then(() => {
        navigation.navigate('AddOnsScreen', { sessionId });
      })
      .catch(err => {
        console.error('❌ Could not save dates', err);
        alert('Unable to save, try again');
      });
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={colors.primaryDark} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.appBar}>
        <Text style={styles.appBarTitle}>Detalles</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Cart list */}
        {carts.map(c => (
          <View key={c.id} style={styles.cartContainer}>
            <Image source={{ uri: c.image_url }} style={styles.cartImage} />
            <View style={styles.cartInfo}>
              <Text style={{ fontSize: scale(22), color: colors.white, fontWeight: '300' }}>{c.model} <Text style={styles.cartTitle}>{c.brand} </Text></Text>
              <Text style={styles.cartText}> {c.passengers}-seater · Battery {c.battery}</Text>
              <Text style={styles.cartPrice}> ${c.daily_price} / day</Text>
            </View>
          </View>
        ))}

        {/* Time pickers */}
        <View style={styles.timeGroupFull}>
          <Text style={styles.timeLabel}>Pick-up Time</Text>
          <TouchableOpacity
            style={styles.inputWithIcon}
            onPress={() => setShowPicker({ mode: 'date', field: 'pickUp', visible: true })}
          >
            <Text style={styles.timeInput}>
              {pickUp.toLocaleString()}
            </Text>
            <MaterialCommunityIcons name="calendar" size={scale(20)} color={colors.grayLight} />
          </TouchableOpacity>
        </View>

        <View style={styles.timeGroupFull}>
          <Text style={styles.timeLabel}>Drop-off Time</Text>
          <TouchableOpacity
            style={styles.inputWithIcon}
            onPress={() => setShowPicker({ mode: 'date', field: 'dropOff', visible: true })}
          >
            <Text style={styles.timeInput}>
              {dropOff.toLocaleString()}
            </Text>
            <MaterialCommunityIcons name="calendar" size={scale(20)} color={colors.grayLight} />
          </TouchableOpacity>
        </View>

        {/* The actual DateTimePicker */}
        {showPicker.visible && (
          <DateTimePicker
            value={showPicker.field === 'pickUp' ? pickUp : dropOff}
            mode={showPicker.mode}
            is24Hour={true}
            display="default"
            onChange={(_, selected) => {
              // when the user selects a date/time or dismisses:
              setShowPicker(s => ({ ...s, visible: false }));
              if (selected) {
                if (showPicker.field === 'pickUp') setPickUp(selected);
                else setDropOff(selected);
              }
            }}
          />
        )}

        {/* Same for all toggle
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Same Duration for all</Text>
          <Switch
            value={sameForAll}
            onValueChange={setSameForAll}
            trackColor={{ true: colors.primaryDark, false: colors.grayLightest }}
            thumbColor={colors.white}
          />
        </View> */}
        <View style={styles.addOnsSection}>
          <Text style={styles.addOnsTitle}>Add Ons</Text>
          <View style={styles.addOnsContainer}>
            {['Cooler', 'Rain Cover', 'Sound Bar'].map(addOn => (
              <TouchableOpacity
                key={addOn}
                style={[
                  styles.addOnCard,
                  // Add logic to highlight selected cards if needed
                ]}
                onPress={() => {
                  // Handle selection logic here
                  console.log(`${addOn} selected`);
                }}
              >
                <Text style={styles.addOnText}>{addOn}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>


      {/* Save button */}
      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveText}>Save & Continue</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#221D1A" },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: scale(16), paddingBottom: scale(100) },
  appBar: { height: scale(56), justifyContent: 'center', alignItems: 'center', backgroundColor: "#221D1A" },
  appBarTitle: { color: colors.white, fontSize: scale(18), fontWeight: '600' },
  cartContainer: { alignItems: 'center', marginBottom: scale(20) },
  cartImage: { width: width * 0.8, height: width * 0.7, backgroundColor: '#221D1A', marginBottom: scale(12) },
  cartInfo: { alignItems: 'flex-start', color: 'white' },
  cartTitle: { fontSize: scale(25), fontWeight: '600', marginBottom: 4, color: 'white' },
  cartText: { fontSize: scale(18), fontWeight: '400', marginBottom: 4, color: 'white' },
  cartPrice: { fontSize: scale(18), fontWeight: '600', marginBottom: 4, color: 'white' },

  timeGroupFull: { margin: scale(10), marginBottom: scale(20) },
  timeLabel: { fontSize: scale(14), marginBottom: scale(8), color: 'white' },
  inputWithIcon: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: scale(6), padding: scale(12) },
  timeInput: { flex: 1, fontSize: scale(16), color: colors.textDark, padding: 0 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: scale(24) },
  toggleLabel: { flex: 1, fontSize: scale(14), color: colors.textDark },

  addOnsSection: { marginVertical: scale(20), paddingHorizontal: scale(16) },
  addOnsTitle: { fontSize: scale(18), fontWeight: '600', color: colors.white, marginBottom: scale(12) },
  addOnsContainer: { flexDirection: 'row', justifyContent: 'space-between' },
  addOnCard: { backgroundColor: colors.white, padding: scale(12), borderRadius: scale(8), alignItems: 'center', width: width * 0.26 },
  addOnText: { fontSize: scale(14), color: colors.textDark },

  saveBtn: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.primaryDark, padding: scale(16), alignItems: 'center' },
  saveText: { color: colors.white, fontSize: scale(16), fontWeight: '600' },
});
