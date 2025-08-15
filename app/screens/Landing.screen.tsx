// app/screens/Landing.screen.tsx

import React, { useEffect, useState } from 'react'
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
} from 'react-native'
import auth from '@react-native-firebase/auth'
import firestore from '@react-native-firebase/firestore'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { colors } from '../theme/colors'
import { scale } from '../theme/scale'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { NavigatorParamList } from '../navigators/navigation-route'

type Props = NativeStackScreenProps<NavigatorParamList, 'LandingScreen'>
const { width } = Dimensions.get('window')

type Cart = {
  id: string              // Firestore document ID
  cart_id: string         // your stored cart_id field
  brand: string
  model: string
  passengers: string
  battery: string
  daily_price: string
  image_url: string
  quantity: number        // local UI state only
}

export default function LandingScreen({ navigation }: Props) {
  const [carts, setCarts]     = useState<Cart[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)

  // 1) Subscribe to Firestore 'carts' collection
  useEffect(() => {
    const unsubscribe = firestore()
      .collection('carts')
      .onSnapshot(
        snap => {
          const data = snap.docs.map(d => {
            const doc = d.data() as any
            return {
              id:          d.id,
              cart_id:     doc.cart_id,
              brand:       doc.brand,
              model:       doc.model,
              passengers:  doc.passangers,      // note: fixed spelling
              battery:     doc.battery,
              daily_price: doc.daily_price,
              image_url:   doc.image_url,
              quantity:    0,
            } as Cart
          })
          setCarts(data)
          setLoading(false)
        },
        err => {
          console.error('❌ carts subscription error', err)
          Alert.alert('Error', 'Could not load carts. Please try again.')
          setLoading(false)
        }
      )
    return unsubscribe
  }, [])

  // adjust a single cart's quantity
  const updateQty = (id: string, delta: number) => {
    setCarts(cs =>
      cs.map(c =>
        c.id === id
          ? { ...c, quantity: Math.max(0, c.quantity + delta) }
          : c
      )
    )
  }

  // render a single cart card
  const renderItem = ({ item }: { item: Cart }) => (
    <View style={styles.card}>
      <Image
        source={{ uri: item.image_url }}
        style={styles.kartImage}
        resizeMode="contain"
      />
      <View style={styles.cardInfo}>
        <Text style={styles.cartType}>
          {`${item.brand} ${item.model}`}
        </Text>
        <Text style={styles.cartDetails}>
          {`${item.passengers}-seater · Battery ${item.battery}`}
        </Text>
        <Text style={styles.cartPrice}>
          {`$${item.daily_price} / day`}
        </Text>
        <View style={styles.qtyRow}>
          <TouchableOpacity
            onPress={() => updateQty(item.id, -1)}
            style={styles.qtyBtn}
          >
            <Text style={styles.qtyBtnText}>−</Text>
          </TouchableOpacity>
          <Text style={styles.qtyValue}>{item.quantity}</Text>
          <TouchableOpacity
            onPress={() => updateQty(item.id, +1)}
            style={styles.qtyBtn}
          >
            <Text style={styles.qtyBtnText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={colors.primaryDark} />
      </View>
    )
  }

  // 2) On “Next”, write an in_progress session then navigate
  const onNext = async () => {
    const selected = carts.filter(c => c.quantity > 0).map(c => c.id);
    if (selected.length === 0) {
      Alert.alert('Select at least one cart to continue')
      return
    }

    const user = auth().currentUser
    if (!user) {
      Alert.alert('Not signed in', 'Please register or log in first.')
      return
    }

    setSaving(true)
    try {
      // build the “partialBooking”
      const partialBooking = {
        carts:      selected.map(c => c.cart_id),
        addons:     {},            // add if you support add-ons here
        dates: {
          start: firestore.FieldValue.serverTimestamp(),  // replace with real start
          end:   firestore.FieldValue.serverTimestamp(),  // replace with real end
        },
        status: 'in_progress' as const,
      }

      // create session doc
      const sessionRef = await firestore()
      .collection('sessions')
      .add({
        customerId: user.uid,
        createdAt: firestore.FieldValue.serverTimestamp(),
        partialBooking: {
          carts: selected,
          addons: {},
          dates: {}
        },
        status: 'in_progress',
        updatedAt: firestore.FieldValue.serverTimestamp()
      });


      console.log('✅ session created', sessionRef.id)
      navigation.navigate('DetailsScreen', { sessionId: sessionRef.id })
    } catch (err) {
      console.error('❌ session write error', err)
      Alert.alert('Error', 'Could not save session. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={carts}
        renderItem={renderItem}
        keyExtractor={c => c.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      <TouchableOpacity
        style={[styles.saveBtn, saving && { opacity: 0.5 }]}
        onPress={onNext}
        disabled={saving}
      >
        {saving
          ? <ActivityIndicator color={colors.white} />
          : <Text style={styles.saveText}>Next</Text>
        }
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: colors.backgroundLight },
  loader:       { flex: 1, alignItems: 'center', justifyContent: 'center' },

  listContent:  { padding: scale(12), paddingBottom: scale(120) },
  card:         {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: scale(12),
    marginBottom: scale(12),
    overflow: 'hidden',
  },
  kartImage:    {
    width: width * 0.35,
    height: scale(100),
    backgroundColor: colors.grayLightest,
  },
  cardInfo:     { flex: 1, padding: scale(12) },
  cartType:     {
    fontSize: scale(16),
    fontWeight: '600',
    color: colors.textDark,
  },
  cartDetails:  {
    fontSize: scale(14),
    color: colors.textDark,
    marginVertical: scale(4),
  },
  cartPrice:    {
    fontSize: scale(14),
    color: colors.textDark,
    marginBottom: scale(8),
  },
  qtyRow:       {
    flexDirection: 'row',
    alignItems: 'center',
  },
  qtyBtn:       {
    backgroundColor: colors.grayLightest,
    paddingHorizontal: scale(8),
    paddingVertical: scale(4),
    borderRadius: scale(4),
  },
  qtyBtnText:   {
    fontSize: scale(16),
    color: colors.textDark,
  },
  qtyValue:     {
    marginHorizontal: scale(12),
    fontSize: scale(16),
    color: colors.textDark,
  },

  saveBtn:      {
    position: 'absolute',
    bottom: scale(40),
    left: scale(12),
    right: scale(12),
    backgroundColor: colors.primaryDark,
    paddingVertical: scale(16),
    borderRadius: scale(8),
    alignItems: 'center',
  },
  saveText:     {
    fontSize: scale(18),
    color: colors.white,
    fontWeight: '600',
  },
})
