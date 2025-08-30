// app/screens/Landing.screen.tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Image,
  ActivityIndicator,
  Dimensions,
  Alert,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../theme/colors';
import { scale } from '../theme/scale';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { NavigatorParamList } from '../navigators/navigation-route';

type Props = NativeStackScreenProps<NavigatorParamList, 'LandingScreen'>;
const { width } = Dimensions.get('window');

type Cart = {
  id: string;
  cart_id: string;
  brand: string;
  model: string;
  passengers: string;
  battery: string;
  daily_price: string;
  image_url: string;
};

export default function LandingScreen({ navigation }: Props) {
  const [carts, setCarts] = useState<Cart[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedCartId, setSelectedCartId] = useState<string | null>(null);

  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [selectedPassengers, setSelectedPassengers] = useState<string | null>(null);

  // 🔹 Subscribe to Firestore 'carts'
  useEffect(() => {
    const unsubscribe = firestore()
      .collection('carts')
      .onSnapshot(
        snap => {
          const data = snap.docs.map(d => {
            const doc = d.data() as any;
            return {
              id: d.id,
              cart_id: doc.cart_id,
              brand: doc.brand,
              model: doc.model,
              passengers: doc.passangers,
              battery: doc.battery,
              daily_price: doc.daily_price,
              image_url: doc.image_url,
            } as Cart;
          });
          setCarts(data);
          setLoading(false);
        },
        err => {
          console.error('❌ carts subscription error', err);
          Alert.alert('Error', 'Could not load carts. Please try again.');
          setLoading(false);
        }
      );
    return unsubscribe;
  }, []);

  // 🔹 On “Next”, save session with the single selected cart
  const onNext = async (cartId?: string) => {
    const finalSelected = cartId || selectedCartId;
    if (!finalSelected) {
      Alert.alert('Select a cart to continue');
      return;
    }

    const user = auth().currentUser;
    if (!user) {
      Alert.alert('Not signed in', 'Please register or log in first.');
      return;
    }

    setSaving(true);
    try {
      const sessionRef = await firestore().collection('sessions').add({
        customerId: user.uid,
        createdAt: firestore.FieldValue.serverTimestamp(),
        partialBooking: {
          carts: [finalSelected],
          addons: [],
          dates: {},
        },
        status: 'in_progress',
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });

      console.log('✅ session created', sessionRef.id);
      navigation.navigate('DetailsScreen', { sessionId: sessionRef.id });
    } catch (err) {
      console.error('❌ session write error', err);
      Alert.alert('Error', 'Could not save session. Try again.');
    } finally {
      setSaving(false);
    }
  };

  // 🔹 Render each cart
  const renderItem = ({ item }: { item: Cart }) => {
    const isSelected = item.id === selectedCartId;
    return (
      <TouchableOpacity
        style={[styles.card, isSelected && { borderColor: colors.primaryDark, borderWidth: 2 }]}
        onPress={() => {
          setSelectedCartId(isSelected ? null : item.id); // toggle
          if (!isSelected) onNext(item.id);
        }}
      >
        <View style={styles.cardInfo}>
          <Text style={styles.cartType}>{`${item.brand} ${item.model}`}</Text>
          <Text style={styles.cartDetails}>{`Battery ${item.battery}`}</Text>
          <View style={styles.cartBottomRow}>
            <Text style={styles.cartPrice}>{`$${item.daily_price} / day`}</Text>
            <Text style={styles.cartSeater}>{`${item.passengers}-seater`}</Text>
          </View>
        </View>
        <Image source={{ uri: item.image_url }} style={styles.kartImage} resizeMode="contain" />
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={colors.primaryDark} />
      </View>
    );
  }

  // 🔹 Filter carts
  const filteredCarts = carts.filter(cart => {
    const matchesModel = selectedModel ? cart.brand === selectedModel : true;
    const matchesPassengers = selectedPassengers ? cart.passengers === selectedPassengers : true;
    return matchesModel && matchesPassengers;
  });

  const uniqueModels = Array.from(new Set(carts.map(cart => cart.brand)));
  const uniquePassengers = Array.from(new Set(carts.map(cart => cart.passengers)));

  return (
    <View style={styles.container}>
      <View style={styles.appBar}>
        <TouchableOpacity onPress={() => console.log('Hamburger menu pressed')}>
          <MaterialCommunityIcons name="account-circle" size={scale(24)} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.appBarTitle}>
          Renta un Carro <Text style={{ fontWeight: '300' }}>de Golf</Text>
        </Text>
        <Text style={styles.appBarSubTitle}>Escoge un Carro</Text>

        {/* Filters */}
        <Text style={styles.filterLabels}>MODELO</Text>
        <View style={styles.filterMenu}>
          {uniqueModels.map(model => (
            <TouchableOpacity
              key={model}
              onPress={() => setSelectedModel(selectedModel === model ? null : model)}
              style={[styles.filterButton, selectedModel === model && styles.filterButtonSelected]}
            >
              <Text style={styles.filterButtonText}>{model}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.filterMenu}>
          {uniquePassengers.map(passenger => (
            <TouchableOpacity
              key={passenger}
              onPress={() =>
                setSelectedPassengers(selectedPassengers === passenger ? null : passenger)
              }
              style={[
                styles.filterButton,
                selectedPassengers === passenger && styles.filterButtonSelected,
              ]}
            >
              <Text style={styles.filterButtonText}>{`${passenger}-seater`}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList
        data={filteredCarts}
        renderItem={renderItem}
        keyExtractor={c => c.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  appBar: {
    flexDirection: 'column',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    padding: scale(25),
    paddingTop: scale(35),
    backgroundColor: '#221D1A',
  },
  appBarTitle: {
    paddingTop: scale(12),
    fontSize: scale(24),
    fontWeight: '600',
    textAlign: 'center',
    color: colors.white,
  },
  appBarSubTitle: {
    paddingTop: scale(1),
    fontSize: scale(20),
    fontWeight: '300',
    textAlign: 'center',
    color: colors.white,
  },
  container: { flex: 1, backgroundColor: colors.backgroundLight },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: scale(12), paddingBottom: scale(120), backgroundColor: '#221D1A' },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: scale(12),
    marginBottom: scale(12),
    overflow: 'hidden',
  },
  kartImage: { width: width * 0.35, height: scale(100), backgroundColor: colors.white },
  cardInfo: { flex: 1, padding: scale(12) },
  cartType: { fontSize: scale(16), fontWeight: '600', color: colors.textDark },
  cartDetails: { fontSize: scale(14), color: colors.textDark, marginVertical: scale(4) },
  cartPrice: { fontSize: scale(14), fontWeight: '500', color: colors.textDark, marginBottom: scale(8) },
  cartBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cartSeater: { fontSize: scale(14), color: colors.textDark },
  saveBtn: {
    position: 'absolute',
    bottom: scale(40),
    left: scale(12),
    right: scale(12),
    backgroundColor: colors.primaryDark,
    paddingVertical: scale(16),
    borderRadius: scale(8),
    alignItems: 'center',
  },
  saveText: { fontSize: scale(18), color: colors.white, fontWeight: '600' },
  filterLabels: { paddingTop: 20, fontSize: scale(14), color: '#A0A0A0', fontWeight: '400' },
  filterMenu: { flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'flex-start', paddingVertical: scale(5) },
  filterButton: {
    marginHorizontal: scale(5),
    paddingVertical: scale(8),
    paddingHorizontal: scale(12),
    borderRadius: scale(8),
    backgroundColor: '#403831',
  },
  filterButtonSelected: { backgroundColor: '#683814' },
  filterButtonText: { fontSize: scale(14), color: colors.white },
});
