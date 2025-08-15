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
  TextInput,
  Switch,
} from 'react-native';
import firestore, {
  FirebaseFirestoreTypes
} from '@react-native-firebase/firestore';
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

  const [pickUp, setPickUp]     = useState<Date>(new Date());
  const [dropOff, setDropOff]   = useState<Date>(new Date());
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
        'partialBooking.dates.end':   dropOff,
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
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.header}>Select Karts & Duration</Text>

        {/* Cart list */}
        {carts.map(c => (
          <TouchableOpacity
            key={c.id}
            style={styles.cartRow}
            onPress={() => toggleCart(c.id)}
          >
            <Image source={{ uri: c.image_url }} style={styles.cartImage} />
            <View style={styles.cartInfo}>
              <Text style={styles.cartTitle}>{c.brand} {c.model}</Text>
              <Text>{c.passengers}-seater · Battery {c.battery}</Text>
              <Text>${c.daily_price} / day</Text>
            </View>
            {c.quantity > 0 && (
              <MaterialCommunityIcons
                name="check-circle"
                size={24}
                color={colors.primaryDark}
              />
            )}
          </TouchableOpacity>
        ))}

        {/* Time pickers */}
        <View style={styles.timeGroupFull}>
          <Text style={styles.timeLabel}>Pick-up Time</Text>
          <View style={styles.inputWithIcon}>
            <TextInput
              value={pickUp}
              onChangeText={setPickUp}
              placeholder="HH:MM"
              placeholderTextColor={colors.grayLight}
              style={styles.timeInput}
            />
            <MaterialCommunityIcons
              name="calendar"
              size={scale(20)}
              color={colors.grayLight}
            />
          </View>
        </View>

        <View style={styles.timeGroupFull}>
          <Text style={styles.timeLabel}>Drop-off Time</Text>
          <View style={styles.inputWithIcon}>
            <TextInput
              value={dropOff}
              onChangeText={setDropOff}
              placeholder="HH:MM"
              placeholderTextColor={colors.grayLight}
              style={styles.timeInput}
            />
            <MaterialCommunityIcons
              name="calendar"
              size={scale(20)}
              color={colors.grayLight}
            />
          </View>
        </View> 
        {/* <View style={styles.timeGroupFull}>
          <Text style={styles.timeLabel}>Pick-up</Text>
          <TouchableOpacity
            style={styles.inputWithIcon}
            onPress={() => setShowPicker({ mode: 'date', field: 'pickUp', visible: true })}
          >
            <Text style={styles.timeInput}>
              {pickUp.toLocaleString()}
            </Text>
            <MaterialCommunityIcons name="calendar" size={scale(20)} color={colors.grayLight} />
          </TouchableOpacity>
        </View> */}

        {/* Drop-off */}
        {/* <View style={styles.timeGroupFull}>
          <Text style={styles.timeLabel}>Drop-off</Text>
          <TouchableOpacity
            style={styles.inputWithIcon}
            onPress={() => setShowPicker({ mode: 'date', field: 'dropOff', visible: true })}
          >
            <Text style={styles.timeInput}>
              {dropOff.toLocaleString()}
            </Text>
            <MaterialCommunityIcons name="calendar" size={scale(20)} color={colors.grayLight} />
          </TouchableOpacity>
        </View> */}

        {/* The actual DateTimePicker */}
        {/* {showPicker.visible && (
          <DateTimePicker
            value={ showPicker.field === 'pickUp' ? pickUp : dropOff }
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
        )} */}

        {/* Same for all toggle */}
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Same Duration for all</Text>
          <Switch
            value={sameForAll}
            onValueChange={setSameForAll}
            trackColor={{ true: colors.primaryDark, false: colors.grayLightest }}
            thumbColor={colors.white}
          />
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
  container: { flex:1, backgroundColor: colors.backgroundLight },
  loader:    { flex:1, alignItems:'center', justifyContent:'center' },
  scrollContent: { padding: scale(16), paddingBottom: scale(100) },
  header:    { fontSize:scale(18), fontWeight:'600', color:colors.primaryDark, marginBottom:scale(12) },

  cartRow:   { flexDirection:'row', alignItems:'center', padding:scale(12), backgroundColor:colors.white, marginBottom:scale(8), borderRadius:scale(8) },
  cartImage: { width:scale(80), height:scale(60), marginRight:scale(12), backgroundColor:colors.grayLightest },
  cartInfo:  { flex:1 },
  cartTitle: { fontWeight:'600', marginBottom:4 },

  timeGroupFull: { marginBottom: scale(20) },
  timeLabel:     { fontSize: scale(14), marginBottom: scale(8) },
  inputWithIcon: { flexDirection:'row', alignItems:'center', backgroundColor:colors.white, borderRadius:scale(6), padding:scale(12) },
  timeInput:     { flex:1, fontSize:scale(16), color:colors.textDark, padding:0 },

  toggleRow:   { flexDirection:'row', alignItems:'center', marginBottom:scale(24) },
  toggleLabel: { flex:1, fontSize:scale(14), color:colors.textDark },

  saveBtn:    { position:'absolute', bottom:0, left:0, right:0, backgroundColor:colors.primaryDark, padding:scale(16), alignItems:'center' },
  saveText:   { color:colors.white, fontSize:scale(16), fontWeight:'600' },
});
