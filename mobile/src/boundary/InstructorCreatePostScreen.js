import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import createInstructorPostController from '../control/CreateInstructorPostController.js';
import viewMyInstructorPostsController from '../control/ViewMyInstructorPostsController.js';
import { POST_CATEGORIES } from '../entities/InstructorPost.js';
import { Screen, Header, Field, Button } from '../components/AppUI.js';
import {
  InstructorNav, VerificationBanner, CategoryChips, ErrorText,
} from '../components/InstructorUI.js';
import { colors } from '../theme/colors.js';
import { type, spacing } from '../theme/typography.js';

export default function InstructorCreatePostScreen({ navigation }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('training');
  const [verified, setVerified] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useFocusEffect(useCallback(() => {
    (async () => {
      const result = await viewMyInstructorPostsController({ limit: 1 });
      if (result.success) setVerified(result.data.credentialsVerified);
    })();
  }, []));

  async function publish() {
    setBusy(true);
    setError('');
    const result = await createInstructorPostController({ title, content, category });
    setBusy(false);
    if (result.success) {
      setTitle('');
      setContent('');
      navigation.navigate('InstructorPostDetails', { postId: result.data.post.postId });
    } else {
      setError(result.message);
    }
  }

  const words = content.trim() ? content.trim().split(/\s+/).length : 0;

  return (
    <Screen>
      <Header title="Create Post" navigation={navigation} />
      <ScrollView contentContainerStyle={s.page}>
        <VerificationBanner verified={verified} />

        <Field
          label="Post title"
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. How to run your easy runs easy"
        />
        <Text style={s.counter}>{title.length}/200</Text>

        <Field
          label="Content"
          value={content}
          onChangeText={setContent}
          placeholder="Share your coaching guidance…"
          multiline
        />
        <Text style={s.counter}>
          {words} word{words === 1 ? '' : 's'} · about {Math.max(1, Math.round(words / 200))} min read
        </Text>

        <Text style={s.label}>Category</Text>
        <CategoryChips
          categories={POST_CATEGORIES}
          active={category}
          onChange={(c) => setCategory(c ?? 'training')}
          includeAll={false}
        />

        <ErrorText>{error}</ErrorText>

        <Button
          style={s.submit}
          onPress={publish}
          disabled={busy || !title.trim() || !content.trim()}
        >
          {busy ? 'Publishing…' : 'Publish Post'}
        </Button>
        <View style={s.spacer} />
      </ScrollView>
      <InstructorNav navigation={navigation} active="Create" />
    </Screen>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: spacing.lg, paddingBottom: 90 },
  counter: { ...type.caption, color: colors.inkFaint, marginTop: -6, marginBottom: spacing.md, textAlign: 'right' },
  label: { ...type.label, color: colors.inkFaint, textTransform: 'uppercase', marginBottom: spacing.sm },
  submit: { marginTop: spacing.lg },
  spacer: { height: 20 },
});
