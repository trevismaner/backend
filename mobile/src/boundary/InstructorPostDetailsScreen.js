import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import viewInstructorPostDetailsController from '../control/ViewInstructorPostDetailsController.js';
import deleteInstructorPostController from '../control/DeleteInstructorPostController.js';
import { Screen, Header, Button } from '../components/AppUI.js';
import { VerifiedTag, Confirm, Loading, ErrorText, categoryLabel } from '../components/InstructorUI.js';
import { colors } from '../theme/colors.js';
import { type, spacing } from '../theme/typography.js';

export default function InstructorPostDetailsScreen({ navigation, route }) {
  const previewPost = route.params?.previewPost;
  const postId = route.params?.postId;
  const [post, setPost] = useState(previewPost || null);
  const [isAuthor, setIsAuthor] = useState(false);
  const [loading, setLoading] = useState(!previewPost);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (previewPost) {
      setPost(previewPost);
      setLoading(false);
      return;
    }
    const result = await viewInstructorPostDetailsController(postId);
    if (result.success) {
      setPost(result.data.post);
      setIsAuthor(result.data.isAuthor);
      setError('');
    } else {
      setError(result.message);
    }
    setLoading(false);
  }, [postId, previewPost]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function remove() {
    setBusy(true);
    const result = await deleteInstructorPostController(postId);
    setBusy(false);
    setConfirm(false);
    if (result.success) navigation.goBack();
    else setError(result.message);
  }

  if (loading) return <Screen><Header title="Post" navigation={navigation} /><Loading /></Screen>;
  if (!post) return <Screen><Header title="Post" navigation={navigation} /><View style={s.page}><ErrorText>{error || 'This post could not be loaded.'}</ErrorText></View></Screen>;

  const edited = post.updatedAt && new Date(post.updatedAt) - new Date(post.createdAt) > 1000;

  return (
    <Screen>
      <Header title="Post" navigation={navigation} />
      <ScrollView contentContainerStyle={s.page}>
        <Text style={s.category}>{categoryLabel(post.category).toUpperCase()}</Text>
        <Text style={s.title}>{post.title}</Text>
        <View style={s.byline}>
          <Text style={s.author}>{post.authorName}</Text>
          <VerifiedTag verified={post.authorVerified} />
        </View>
        <Text style={s.date}>{new Date(post.createdAt).toLocaleDateString()}{edited ? ` · edited ${new Date(post.updatedAt).toLocaleDateString()}` : ''}</Text>
        <Text style={s.body}>{post.content}</Text>
        <ErrorText>{error}</ErrorText>
        {isAuthor && !previewPost && (
          <View style={s.actions}>
            <Button variant="secondary" onPress={() => navigation.navigate('InstructorEditPost', { postId })}>Edit Post</Button>
            <Button variant="danger" onPress={() => setConfirm(true)} disabled={busy}>Delete Post</Button>
          </View>
        )}
      </ScrollView>
      <Confirm visible={confirm} title="Delete this post?" message={`"${post.title}" will be removed from the Instructor Board. This cannot be undone.`} confirmLabel="Delete permanently" busy={busy} onConfirm={remove} onCancel={() => setConfirm(false)} />
    </Screen>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: spacing.lg, paddingBottom: 48 },
  category: { ...type.label, color: colors.primary, textTransform: 'uppercase', marginTop: spacing.sm },
  title: { ...type.title, color: colors.ink, marginTop: 8 },
  byline: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: spacing.md },
  author: { ...type.bodyStrong, color: colors.ink },
  date: { ...type.caption, color: colors.inkFaint, marginTop: 6 },
  body: { ...type.body, color: colors.inkMuted, lineHeight: 22, marginTop: spacing.lg },
  actions: { gap: 12, marginTop: spacing.xl },
});
