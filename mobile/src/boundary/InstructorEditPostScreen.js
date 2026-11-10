import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import viewInstructorPostDetailsController from '../control/ViewInstructorPostDetailsController.js';
import updateInstructorPostController from '../control/UpdateInstructorPostController.js';
import deleteInstructorPostController from '../control/DeleteInstructorPostController.js';
import { POST_CATEGORIES } from '../entities/InstructorPost.js';
import { Screen, Header, Field, Button } from '../components/AppUI.js';
import { CategoryChips, Confirm, Loading, ErrorText } from '../components/InstructorUI.js';
import { colors } from '../theme/colors.js';
import { type, spacing } from '../theme/typography.js';

export default function InstructorEditPostScreen({ navigation, route }) {
  const { postId } = route.params;
  const [original, setOriginal] = useState(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);

  const load = useCallback(async () => {
    const result = await viewInstructorPostDetailsController(postId);
    if (result.success) {
      const post = result.data.post;
      setOriginal(post);
      setTitle(post.title || '');
      setContent(post.content || '');
      setCategory(post.category || null);
      setError('');
    } else {
      setError(result.message);
    }
    setLoading(false);
  }, [postId]);

  useEffect(() => { load(); }, [load]);

  function changedFields() {
    if (!original) return {};
    const changes = {};
    if (title.trim() !== (original.title || '')) changes.title = title.trim();
    if (content.trim() !== (original.content || '')) changes.content = content.trim();
    if ((category || null) !== (original.category || null)) changes.category = category;
    return changes;
  }

  const dirty = Object.keys(changedFields()).length > 0;

  async function save() {
    setBusy(true);
    setError('');
    const result = await updateInstructorPostController({ postId, changes: changedFields() });
    setBusy(false);
    if (result.success) navigation.goBack();
    else setError(result.message);
  }

  async function remove() {
    setBusy(true);
    const result = await deleteInstructorPostController(postId);
    setBusy(false);
    setConfirm(false);
    if (result.success) {
      navigation.navigate('InstructorDashboard');
    } else {
      setError(result.message);
    }
  }

  if (loading) {
    return <Screen><Header title="Update Post" navigation={navigation} /><Loading /></Screen>;
  }

  if (!original) {
    return (
      <Screen>
        <Header title="Update Post" navigation={navigation} />
        <View style={s.page}><ErrorText>{error || 'This post could not be loaded.'}</ErrorText></View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title="Update Post" navigation={navigation} />
      <ScrollView contentContainerStyle={s.page}>
        <Field label="Post title" value={title} onChangeText={setTitle} />
        <Text style={s.counter}>{title.length}/200</Text>

        <Field label="Content" value={content} onChangeText={setContent} multiline />

        <Text style={s.label}>Category</Text>
        <CategoryChips
          categories={POST_CATEGORIES}
          active={category}
          onChange={setCategory}
          includeAll
        />

        <ErrorText>{error}</ErrorText>

        <Button style={s.save} onPress={save} disabled={busy || !dirty}>
          {busy ? 'Saving…' : dirty ? 'Save Changes' : 'No Changes'}
        </Button>
        <Button variant="danger" style={s.delete} onPress={() => setConfirm(true)} disabled={busy}>
          Delete Post
        </Button>
      </ScrollView>

      <Confirm
        visible={confirm}
        title="Delete this post?"
        message={`"${original.title}" will be removed from the Instructor Board. This cannot be undone.`}
        confirmLabel="Delete permanently"
        busy={busy}
        onConfirm={remove}
        onCancel={() => setConfirm(false)}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: spacing.lg, paddingBottom: 48 },
  counter: { ...type.caption, color: colors.inkFaint, marginTop: -6, marginBottom: spacing.md, textAlign: 'right' },
  label: { ...type.label, color: colors.inkFaint, textTransform: 'uppercase', marginBottom: spacing.sm },
  save: { marginTop: spacing.lg },
  delete: { marginTop: 12 },
});
