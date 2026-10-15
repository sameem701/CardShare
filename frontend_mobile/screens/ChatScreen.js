import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import TextField from '../components/TextField';
import { hiddenScrollProps } from '../utils/webChrome';
import * as ImagePicker from 'expo-image-picker';
import { getChatImageUploadUrl, sendMessage } from '../api/chat';
import ErrorBanner from '../components/ErrorBanner';
import LoadingState from '../components/LoadingState';
import PrimaryButton from '../components/PrimaryButton';
import ProofImage from '../components/ProofImage';
import SecondaryButton from '../components/SecondaryButton';
import TopBar from '../components/TopBar';
import theme from '../constants/theme';
import { useChatCache } from '../context/ChatCache';
import { useSession } from '../context/SessionContext';
import { formatTime } from '../utils/format';
import { prepareImage, uploadBlobToSignedUrl } from '../utils/upload';
import { useBottomInset } from '../hooks/useTopInset';

export default function ChatScreen({ threadId, canSend = false, onBack }) {
  const { sessionId, user } = useSession();
  const { threads, prefetch, refreshNewest, loadOlder } = useChatCache();
  const bottomInset = useBottomInset();
  const allowOlder = useRef(false);
  const [text, setText] = useState('');
  const [working, setWorking] = useState(false);
  const [sendError, setSendError] = useState('');
  const thread = threads[threadId];
  const messages = thread?.messages || [];
  const loading = !thread || thread.loading;
  const error = sendError || thread?.error || '';

  useEffect(() => {
    prefetch(threadId);
  }, [prefetch, threadId]);

  useEffect(() => {
    if (!canSend) return undefined;
    const id = setInterval(() => refreshNewest(threadId), 8000);
    return () => clearInterval(id);
  }, [canSend, refreshNewest, threadId]);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setWorking(true);
    setSendError('');
    try {
      await sendMessage(sessionId, user.id, threadId, trimmed, null);
      setText('');
      await refreshNewest(threadId);
    } catch (err) {
      setSendError(err.message);
    } finally {
      setWorking(false);
    }
  };

  const sendImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setSendError('Photo library permission is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.5,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;

    setWorking(true);
    setSendError('');
    try {
      const prepared = await prepareImage(result.assets[0]);
      const slot = await getChatImageUploadUrl(sessionId, user.id, threadId, prepared.ext);
      await uploadBlobToSignedUrl(slot.signed_url, prepared.blob, prepared.mime);
      await sendMessage(sessionId, user.id, threadId, null, slot.path);
      await refreshNewest(threadId);
    } catch (err) {
      setSendError(err.message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TopBar title="Chat" onBack={onBack} />
      {loading && messages.length === 0 ? (
        <LoadingState />
      ) : (
        <FlatList
          {...hiddenScrollProps}
          inverted={messages.length > 0}
          style={styles.listFlex}
          data={[...messages].reverse()}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onScroll={() => { allowOlder.current = true; }}
          scrollEventThrottle={64}
          onEndReached={() => {
            if (allowOlder.current) loadOlder(threadId);
          }}
          onEndReachedThreshold={0.2}
          ListFooterComponent={thread?.loadingOlder ? <LoadingState message="Loading earlier messages…" /> : null}
          ListEmptyComponent={<Text style={styles.empty}>No messages yet.</Text>}
          renderItem={({ item }) => {
            const mine = item.sender_id === user.id;
            return (
              <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                {!mine ? <Text style={styles.sender}>{item.sender_name}</Text> : null}
                {item.chat_message ? <Text style={styles.msg}>{item.chat_message}</Text> : null}
                {item.attachment_signed_url ? (
                  <ProofImage
                    uri={item.attachment_signed_url}
                    style={styles.chatImage}
                    resizeMode="cover"
                    onReload={() => refreshNewest(threadId)}
                  />
                ) : null}
                <Text style={styles.time}>{formatTime(item.created_at)}</Text>
              </View>
            );
          }}
        />
      )}
      <View style={styles.errorPad}>
        <ErrorBanner message={error} onRetry={() => refreshNewest(threadId)} />
      </View>
      {!canSend ? (
        <Text style={[styles.readOnly, { paddingBottom: bottomInset }]}>Chat is read-only for completed transactions.</Text>
      ) : (
        <View style={[styles.composer, { paddingBottom: bottomInset }]}>
          <View style={styles.field}>
            <TextField
              value={text}
              onChangeText={setText}
              placeholder="Message"
              accessibilityLabel="Message"
              editable={!working}
            />
          </View>
          <PrimaryButton compact label="Send" loading={working} onPress={send} />
          <SecondaryButton compact label="Image" disabled={working} onPress={sendImage} />
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  listFlex: {
    flex: 1,
  },
  list: {
    paddingHorizontal: theme.layout.screenPadding,
    paddingBottom: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  empty: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    color: theme.colors.text2,
    textAlign: 'center',
    marginTop: theme.spacing.xxl,
  },
  bubble: {
    borderRadius: theme.radius.control,
    padding: theme.spacing.md,
    maxWidth: '85%',
  },
  mine: {
    alignSelf: 'flex-end',
    backgroundColor: theme.colors.greenDim,
  },
  theirs: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.bg3,
  },
  sender: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: theme.fontSize.small,
    color: theme.colors.text2,
    marginBottom: theme.spacing.xs,
  },
  msg: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    color: theme.colors.text,
  },
  time: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.caption,
    color: theme.colors.text3,
    marginTop: theme.spacing.xs,
  },
  chatImage: {
    width: 180,
    height: 120,
    borderRadius: theme.radius.xs,
    marginTop: theme.spacing.xs,
  },
  errorPad: {
    paddingHorizontal: theme.layout.screenPadding,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.layout.screenPadding,
    paddingTop: theme.spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: theme.colors.border,
  },
  field: {
    flex: 1,
  },
  readOnly: {
    fontFamily: theme.fonts.body,
    fontSize: theme.fontSize.body,
    color: theme.colors.text2,
    textAlign: 'center',
    padding: theme.layout.screenPadding,
  },
});
