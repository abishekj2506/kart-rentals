// app/screens/AddOns.screen.tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Switch,
  FlatList,
  Alert,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import firestore from '@react-native-firebase/firestore';
import { colors } from '../theme/colors';
import { scale } from '../theme/scale';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { NavigatorParamList } from '../navigators/navigation-route';

const { width } = Dimensions.get('window');

type Props = NativeStackScreenProps<NavigatorParamList, 'AddOnsScreen'>;

type AddOn = {
  label: string;
  selected: boolean;
};

export default function AddOnsScreen({ navigation, route }: Props) {
  // grab sessionId from route params
  const { sessionId } = (route.params || {}) as { sessionId?: string };

  const [loading, setLoading] = useState(true);
  const [addons, setAddons] = useState<AddOn[]>([]);

  useEffect(() => {
    if (!sessionId) {
      Alert.alert('Missing session', 'No sessionId was provided to Add-Ons screen.');
      setLoading(false);
      return;
    }

    let cancelled = false;

    const parseAddonsField = (raw: any): string[] => {
      if (!raw) return [];
      // direct array
      if (Array.isArray(raw)) return raw.map(String).map(s => s.trim()).filter(Boolean);

      // object with keys? try values
      if (typeof raw === 'object') {
        return Object.values(raw).map(String).map(s => s.trim()).filter(Boolean);
      }

      // string: try to parse JSON first (in some docs it's stored as "['A','B']")
      if (typeof raw === 'string') {
        const s = raw.trim();
        try {
          // attempt JSON parse if it's valid JSON
          const p = JSON.parse(s);
          if (Array.isArray(p)) return p.map(String).map(i => i.trim()).filter(Boolean);
        } catch (e) {
          // not valid JSON, fall through to manual parse
        }

        // remove surrounding [] if present and split on commas
        const stripped = s.replace(/^\[|\]$/g, '').trim();
        if (!stripped) return [];
        // split by comma, remove surrounding quotes/spaces
        return stripped
          .split(',')
          .map(x => x.replace(/^["']|["']$/g, '').trim())
          .filter(Boolean);
      }

      return [];
    };

    const load = async () => {
      try {
        const db = firestore();
        const sessionSnap = await db.collection('sessions').doc(sessionId).get();
        if (!sessionSnap.exists) {
          throw new Error('Session not found');
        }
        const sessionData = sessionSnap.data() as any;
        const partial = sessionData?.partialBooking || {};
        const cartIds: string[] = Array.isArray(partial?.carts) ? partial.carts : [];

        // Parse any previously saved addons from session (handles array / object / string)
        const existingAddons = parseAddonsField(partial?.addons);

        if (cartIds.length === 0) {
          // no carts selected — still show previously saved addons (preselected)
          if (!cancelled) {
            const listFromSession = Array.from(new Set(existingAddons)).map(label => ({
              label,
              selected: true,
            }));
            setAddons(listFromSession);
          }
          return;
        }

        // fetch cart docs
        const cartDocs = await Promise.all(
          cartIds.map(id => db.collection('carts').doc(id).get())
        );

        const setOfAddons = new Set<string>();
        for (const cd of cartDocs) {
          if (!cd.exists) continue;
          const d = cd.data() as any;

          // try multiple potential field names
          const candidates = [
            d['Add-ons'],
            d['addons'],
            d['addOns'],
            d['add_ons'],
            d['AddOns'],
          ];

          for (const cand of candidates) {
            const parsed = parseAddonsField(cand);
            parsed.forEach(a => setOfAddons.add(a));
          }
        }

        // union with existingAddons (so previously saved addons are preserved)
        existingAddons.forEach(a => setOfAddons.add(a));

        if (!cancelled) {
          const list = Array.from(setOfAddons).map(label => ({
            label,
            selected: existingAddons.includes(label), // preselect if stored in session
          }));
          setAddons(list);
        }
      } catch (err: any) {
        console.error('❌ AddOns load error', err);
        Alert.alert('Error loading add-ons', err.message || String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const toggle = (label: string) => {
    setAddons(a => a.map(x => (x.label === label ? { ...x, selected: !x.selected } : x)));
  };

  const onSave = async () => {
    if (!sessionId) {
      Alert.alert('Missing session', 'No sessionId available');
      return;
    }
    const selected = addons.filter(a => a.selected).map(a => a.label);
    try {
      setLoading(true);
      const db = firestore();
      await db
        .collection('sessions')
        .doc(sessionId)
        .set(
          { partialBooking: { addons: selected } },
          { merge: true } // merge so we don't overwrite other partialBooking fields
        );

      // navigate to review, passing sessionId
      navigation.navigate('ReviewScreen', { sessionId });
    } catch (err: any) {
      console.error('❌ AddOns save error', err);
      Alert.alert('Save failed', err.message || 'Please try again');
    } finally {
      setLoading(false);
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons
            name="chevron-left"
            size={scale(24)}
            color={colors.textDark}
          />
        </TouchableOpacity>
        <Text style={styles.title}>Add-ons</Text>
        <View style={{ width: scale(24) }} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        {addons.length === 0 ? (
          <Text style={styles.placeholderText}>(No add-ons available for the selected karts)</Text>
        ) : (
          <FlatList
            data={addons}
            keyExtractor={(it) => it.label}
            contentContainerStyle={{ paddingHorizontal: scale(16) }}
            renderItem={({ item }) => (
              <View style={styles.addonRow}>
                <Text style={styles.addonLabel}>{item.label}</Text>
                <Switch
                  value={item.selected}
                  onValueChange={() => toggle(item.label)}
                  trackColor={{ true: colors.primaryDark, false: colors.grayLightest }}
                  thumbColor={colors.white}
                />
              </View>
            )}
          />
        )}
      </View>

      {/* Save button → pass sessionId along */}
      <TouchableOpacity
        style={styles.saveBtn}
        onPress={onSave}
      >
        <Text style={styles.saveText}>Save</Text>
      </TouchableOpacity>

      {/* Pagination dots */}
      <View style={styles.dotsRow}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === 3 && { backgroundColor: colors.grayLight },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundLight },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: scale(16),
    justifyContent: 'space-between',
  },
  title: {
    fontSize: scale(18),
    fontWeight: '600',
    color: colors.primaryDark,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: scale(14),
    color: colors.grayLight,
    textAlign: 'center',
  },
  saveBtn: {
    backgroundColor: colors.primaryDark,
    marginHorizontal: scale(16),
    paddingVertical: scale(14),
    borderRadius: scale(8),
    alignItems: 'center',
  },
  saveText: {
    color: colors.white,
    fontSize: scale(16),
    fontWeight: '600',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: scale(12),
  },
  dot: {
    width: scale(8),
    height: scale(8),
    borderRadius: scale(4),
    backgroundColor: colors.primaryDark,
    marginHorizontal: scale(4),
  },

  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  addonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.white,
    padding: scale(12),
    borderRadius: scale(8),
    marginBottom: scale(10),
  },
  addonLabel: {
    fontSize: scale(14),
    color: colors.textDark,
  },
});
