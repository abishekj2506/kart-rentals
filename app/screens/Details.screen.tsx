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
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors } from '../theme/colors';
import { scale } from '../theme/scale';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { NavigatorParamList } from '../navigators/navigation-route';

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
  quantity: number;
};

type AddOn = {
  label: string;
  selected: boolean;
};

export default function DetailsScreen({ route, navigation }: Props) {
  const { sessionId } = route.params as { sessionId: string };

  const [carts, setCarts] = useState<Cart[]>([]);
  const [addons, setAddons] = useState<AddOn[]>([]);
  const [loading, setLoading] = useState(true);

  const [pickUp, setPickUp] = useState<Date>(new Date());
  const [dropOff, setDropOff] = useState<Date>(new Date());
  const [showPicker, setShowPicker] = useState<{
    mode: 'date' | 'time';
    field: 'pickUp' | 'dropOff';
    visible: boolean;
  }>({ mode: 'date', field: 'pickUp', visible: false });

  // helper: parse Add-ons field from Firestore
  const parseAddonsField = (raw: any): string[] => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(String).map(s => s.trim()).filter(Boolean);

    if (typeof raw === 'string') {
      const stripped = raw.replace(/^\[|\]$/g, '');
      return stripped
        .split(',')
        .map(s => s.replace(/^['"]|['"]$/g, '').trim())
        .filter(Boolean);
    }

    return [];
  };

  // 🔹 Load session + carts + add-ons
  useEffect(() => {
    const docRef = firestore().collection('sessions').doc(sessionId);

    docRef
      .get()
      .then(async docSnap => {
        if (!docSnap.exists) throw new Error('Session not found');
        const data = docSnap.data() as any;

        const cartIds: string[] = Array.isArray(data.partialBooking?.carts)
          ? data.partialBooking.carts
          : [];

        const db = firestore();
        const cartDocs = await Promise.all(cartIds.map(id => db.collection('carts').doc(id).get()));

        const addOnSet = new Set<string>();
        const fetched: Cart[] = [];

        for (const cd of cartDocs) {
          if (!cd.exists) continue;
          const d = cd.data() as any;

          fetched.push({
            id: cd.id,
            brand: d.brand,
            model: d.model,
            image_url: d.image_url,
            daily_price: d.daily_price,
            passengers: d.passangers || d.passengers || 'N/A',
            battery: d.battery,
            quantity: 0, // start unselected
          });

          const candidates = parseAddonsField(
            d['Add-ons'] || d['addons'] || d['addOns'] || d['add_ons']
          );
          candidates.forEach(a => addOnSet.add(a));
        }

        setCarts(fetched);
        setAddons(Array.from(addOnSet).map(label => ({ label, selected: false })));
      })
      .catch(err => console.error('❌ Details load error', err))
      .finally(() => setLoading(false));
  }, [sessionId]);

  // 🔹 Only one cart can be selected
  const toggleCart = (id: string) =>
    setCarts(cs => cs.map(c => ({ ...c, quantity: c.id === id ? (c.quantity > 0 ? 0 : 1) : 0 })));

  // 🔹 Toggle add-ons
  const toggleAddon = (label: string) =>
    setAddons(as => as.map(a => (a.label === label ? { ...a, selected: !a.selected } : a)));

  // 🔹 Save everything into session
  const handleSave = async () => {
    try {
      const selectedAddons = addons.filter(a => a.selected).map(a => a.label);
      const selectedCarts = carts.filter(c => c.quantity > 0).map(c => c.id);

      await firestore().collection('sessions').doc(sessionId).update({
        'partialBooking.dates.start': pickUp,
        'partialBooking.dates.end': dropOff,
        'partialBooking.addons': selectedAddons,
        'partialBooking.carts': selectedCarts,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });

      navigation.navigate('ReviewScreen', { sessionId });
    } catch (err) {
      console.error('❌ Could not save details', err);
      alert('Unable to save, try again');
    }
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
        <Text style={styles.appBarTitle}>Details</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* 🔹 Cart list */}
        {carts.map(c => (
          <TouchableOpacity
            key={c.id}
            style={[styles.cartContainer, c.quantity > 0 && { borderColor: colors.primaryDark }]}
            onPress={() => toggleCart(c.id)}
          >
            <Image source={{ uri: c.image_url }} style={styles.cartImage} />
            <View style={styles.cartInfo}>
              <Text style={{ fontSize: scale(22), color: colors.white, fontWeight: '300' }}>
                {c.model} <Text style={styles.cartTitle}>{c.brand}</Text>
              </Text>
              <Text style={styles.cartText}>
                {c.passengers}-seater · Battery {c.battery}
              </Text>
              <Text style={styles.cartPrice}>${c.daily_price} / day</Text>
            </View>
          </TouchableOpacity>
        ))}

        {/* 🔹 Time pickers */}
        <View style={styles.timeGroupFull}>
          <Text style={styles.timeLabel}>Pick-up Time</Text>
          <TouchableOpacity
            style={styles.inputWithIcon}
            onPress={() => setShowPicker({ mode: 'date', field: 'pickUp', visible: true })}
          >
            <Text style={styles.timeInput}>{pickUp.toLocaleString()}</Text>
            <MaterialCommunityIcons name="calendar" size={scale(20)} color={colors.grayLight} />
          </TouchableOpacity>
        </View>

        <View style={styles.timeGroupFull}>
          <Text style={styles.timeLabel}>Drop-off Time</Text>
          <TouchableOpacity
            style={styles.inputWithIcon}
            onPress={() => setShowPicker({ mode: 'date', field: 'dropOff', visible: true })}
          >
            <Text style={styles.timeInput}>{dropOff.toLocaleString()}</Text>
            <MaterialCommunityIcons name="calendar" size={scale(20)} color={colors.grayLight} />
          </TouchableOpacity>
        </View>

        {/* DateTime Picker */}
        {showPicker.visible && (
          <DateTimePicker
            value={showPicker.field === 'pickUp' ? pickUp : dropOff}
            mode={showPicker.mode}
            is24Hour={true}
            display="default"
            onChange={(_, selected) => {
              setShowPicker(s => ({ ...s, visible: false }));
              if (selected) {
                if (showPicker.field === 'pickUp') setPickUp(selected);
                else setDropOff(selected);
              }
            }}
          />
        )}

        {/* 🔹 Add-ons */}
        <View style={styles.addOnsSection}>
          <Text style={styles.addOnsTitle}>Add Ons</Text>
          {addons.length === 0 ? (
            <Text style={{ color: colors.grayLight, fontSize: scale(14) }}>
              (No add-ons available for this cart)
            </Text>
          ) : (
            <View style={styles.addOnsContainer}>
              {addons.map(a => (
                <TouchableOpacity
                  key={a.label}
                  style={[
                    styles.addOnCard,
                    a.selected && { backgroundColor: colors.primaryDark },
                  ]}
                  onPress={() => toggleAddon(a.label)}
                >
                  <Text
                    style={[
                      styles.addOnText,
                      a.selected && { color: colors.white, fontWeight: '600' },
                    ]}
                  >
                    {a.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
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
  container: { flex: 1, backgroundColor: '#221D1A' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: scale(16), paddingBottom: scale(100) },
  appBar: { height: scale(56), justifyContent: 'center', alignItems: 'center', backgroundColor: '#221D1A' },
  appBarTitle: { color: colors.white, fontSize: scale(18), fontWeight: '600' },
  cartContainer: {
    alignItems: 'center',
    marginBottom: scale(20),
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: scale(8),
    padding: scale(8),
  },
  cartImage: { width: width * 0.8, height: width * 0.7, backgroundColor: '#221D1A', marginBottom: scale(12) },
  cartInfo: { alignItems: 'flex-start' },
  cartTitle: { fontSize: scale(25), fontWeight: '600', marginBottom: 4, color: 'white' },
  cartText: { fontSize: scale(18), fontWeight: '400', marginBottom: 4, color: 'white' },
  cartPrice: { fontSize: scale(18), fontWeight: '600', marginBottom: 4, color: 'white' },
  timeGroupFull: { margin: scale(10), marginBottom: scale(20) },
  timeLabel: { fontSize: scale(14), marginBottom: scale(8), color: 'white' },
  inputWithIcon: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: scale(6), padding: scale(12) },
  timeInput: { flex: 1, fontSize: scale(16), color: colors.textDark },
  addOnsSection: { marginVertical: scale(20), paddingHorizontal: scale(16) },
  addOnsTitle: { fontSize: scale(18), fontWeight: '600', color: colors.white, marginBottom: scale(12) },
  addOnsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(12) },
  addOnCard: { backgroundColor: colors.white, padding: scale(12), borderRadius: scale(8), alignItems: 'center', minWidth: width * 0.26 },
  addOnText: { fontSize: scale(14), color: colors.textDark },
  saveBtn: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.primaryDark, padding: scale(16), alignItems: 'center' },
  saveText: { color: colors.white, fontSize: scale(16), fontWeight: '600' },
});
