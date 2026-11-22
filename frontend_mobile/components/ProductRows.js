import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import theme from '../constants/theme';
import { blankProduct } from '../utils/products';

function Icon({ name, size = 18, color = theme.colors.text3 }) {
  const common = {
    stroke: color,
    strokeWidth: name === 'x' ? 2.8 : 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    fill: 'none',
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {name === 'link' ? (
        <>
          <Path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" {...common} />
          <Path d="M14 10a4 4 0 00-5.7 0l-3 3A4 4 0 0011 18.7l1-1" {...common} />
        </>
      ) : null}
      {name === 'note' ? (
        <>
          <Path d="M5 5h14a1 1 0 011 1v9a1 1 0 01-1 1h-8l-4 3.5V16H5a1 1 0 01-1-1V6a1 1 0 011-1z" {...common} />
          <Path d="M8 9.5h8M8 12.5h5" {...common} />
        </>
      ) : null}
      {name === 'chev' ? <Path d="M6 9l6 6 6-6" {...common} /> : null}
      {name === 'x' ? <Path d="M6 6l12 12M18 6L6 18" {...common} /> : null}
      {name === 'plus' ? <Path d="M12 5v14M5 12h14" {...common} /> : null}
      {name === 'minus' ? <Path d="M5 12h14" {...common} /> : null}
    </Svg>
  );
}

function Bare({ value, onChangeText, placeholder, onFocus, autoCapitalize = 'sentences' }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.text3}
      onFocus={onFocus}
      autoCapitalize={autoCapitalize}
      autoCorrect={false}
      style={styles.bare}
    />
  );
}

export default function ProductRows({ products, onChange }) {
  const setRow = (key, patch) => {
    onChange(products.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  };

  const openRow = (key) => {
    onChange(products.map((item) => ({ ...item, open: item.key === key })));
  };

  return (
    <View style={[styles.grp, products.length < 2 && styles.single]}>
      {products.map((item) => {
        const open = Boolean(item.open);
        const hasBits = Boolean(item.url || item.note);
        return (
          <View key={item.key} style={[styles.gi, open && styles.giOpen]}>
            {products.length > 1 ? (
              <Pressable
                onPress={() => onChange(products.filter((row) => row.key !== item.key))}
                style={styles.rmb}
                accessibilityRole="button"
                accessibilityLabel="Remove product"
              >
                <Icon name="x" size={11} color={theme.colors.text2} />
              </Pressable>
            ) : null}
            <View style={styles.gl}>
              <View style={styles.nmw}>
                <Bare
                  value={item.title}
                  onChangeText={(title) => setRow(item.key, { title })}
                  placeholder="Product name"
                  onFocus={() => openRow(item.key)}
                />
                {!open && hasBits ? (
                  <View style={styles.under}>
                    {item.url ? (
                      <View style={styles.dot}><Icon name="link" size={13} color={theme.colors.green} /></View>
                    ) : null}
                    {item.note ? (
                      <View style={styles.dot}><Icon name="note" size={13} color={theme.colors.green} /></View>
                    ) : null}
                  </View>
                ) : null}
              </View>
              <View style={styles.qp}>
                <Pressable
                  onPress={() => setRow(item.key, { qty: Math.max(1, (Number(item.qty) || 1) - 1) })}
                  disabled={(Number(item.qty) || 1) < 2}
                  style={styles.qpBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Less"
                >
                  <Icon name="minus" size={17} color={theme.colors.text} />
                </Pressable>
                <Text style={styles.qn}>{Number(item.qty) || 1}</Text>
                <Pressable
                  onPress={() => setRow(item.key, { qty: Math.min(99, (Number(item.qty) || 1) + 1) })}
                  style={styles.qpBtn}
                  accessibilityRole="button"
                  accessibilityLabel="More"
                >
                  <Icon name="plus" size={17} color={theme.colors.text} />
                </Pressable>
              </View>
              <Pressable
                onPress={() => openRow(open ? '' : item.key)}
                style={[styles.chv, open && styles.chvOpen]}
                accessibilityRole="button"
                accessibilityLabel="Link and note"
              >
                <View style={open ? styles.chevOpen : null}>
                  <Icon name="chev" color={open ? theme.colors.green : theme.colors.text3} />
                </View>
              </Pressable>
            </View>
            {open ? (
              <View style={styles.pni}>
                <View style={styles.ir}>
                  <Icon name="link" />
                  <TextInput
                    value={item.url}
                    onChangeText={(url) => setRow(item.key, { url })}
                    placeholder="Paste product link"
                    placeholderTextColor={theme.colors.text3}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.irInput}
                  />
                </View>
                <View style={styles.ir}>
                  <Icon name="note" />
                  <TextInput
                    value={item.note}
                    onChangeText={(note) => setRow(item.key, { note })}
                    placeholder="Note for this product"
                    placeholderTextColor={theme.colors.text3}
                    style={styles.irInput}
                  />
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
      <Pressable
        onPress={() => {
          const next = blankProduct('', true);
          onChange(products.map((item) => ({ ...item, open: false })).concat(next));
        }}
        style={styles.add}
        accessibilityRole="button"
      >
        <View style={styles.addI}><Icon name="plus" size={15} color={theme.colors.green} /></View>
        <Text style={styles.addText}>Add product</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  grp: {
    marginTop: 10,
    marginBottom: 8,
  },
  single: {},
  gi: {
    position: 'relative',
    backgroundColor: theme.colors.bg2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: 16,
    marginTop: 12,
  },
  giOpen: {
    borderColor: 'rgba(0,200,122,0.4)',
  },
  rmb: {
    position: 'absolute',
    top: -9,
    right: -7,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.bg,
    backgroundColor: theme.colors.bg4,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  gl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    paddingLeft: 14,
    paddingRight: 6,
    minHeight: 64,
  },
  nmw: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  bare: {
    width: '100%',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border2,
    paddingVertical: 6,
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 16,
    color: theme.colors.text,
  },
  under: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  dot: {
    width: 26,
    height: 24,
    borderRadius: 7,
    backgroundColor: theme.colors.bg3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qp: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    backgroundColor: theme.colors.bg3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border2,
    borderRadius: 21,
    paddingHorizontal: 3,
  },
  qpBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qn: {
    minWidth: 26,
    textAlign: 'center',
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 17,
    color: theme.colors.text,
  },
  chv: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chvOpen: {
    backgroundColor: theme.colors.greenDim,
  },
  chevOpen: {
    transform: [{ rotate: '180deg' }],
  },
  pni: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
  },
  ir: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    backgroundColor: theme.colors.bg3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border2,
    borderRadius: 10,
    height: 44,
  },
  irInput: {
    flex: 1,
    minWidth: 0,
    fontFamily: theme.fonts.body,
    fontSize: 15,
    color: theme.colors.text,
  },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 12,
    paddingVertical: 6,
    paddingRight: 4,
  },
  addI: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.greenDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 15,
    color: theme.colors.green,
  },
});
