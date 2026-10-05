import { useState, useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { POST_CATEGORIES } from '../entities/InstructorPost.js';
import viewMyInstructorPostsController from '../control/ViewMyInstructorPostsController.js';
import { Screen, Header, Button } from '../components/AppUI.js';
import {
  InstructorNav, VerificationBanner, CategoryChips, PostCard,
  Loading, Empty, ErrorText, instructorStyles,
} from '../components/InstructorUI.js';
import { colors } from '../theme/colors.js';
import { type, spacing } from '../theme/typography.js';

export default function InstructorPostsScreen({ navigation }) {
  const [posts, setPosts] = useState([]);
  const [verified, setVerified] = useState(true);
  const [category, setCategory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const result = await viewMyInstructorPostsController({ limit: 100 });
    if (result.success) {
      setPosts(result.data.posts || []);
      setVerified(result.data.credentialsVerified);
      setError('');
    } else {
      setError(result.message);
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const visible = useMemo(
    () => (category ? posts.filter((p) => p.category === category) : posts),
    [posts, category]
  );

  return (
    <Screen>
      <Header title="My Posts" navigation={navigation} />
      <FlatList
        data={visible}
        keyExtractor={(item) => String(item.postId)}
        contentContainerStyle={instructorStyles.content}
        ListHeaderComponent={
          <>
            <VerificationBanner verified={verified} />
            <CategoryChips categories={POST_CATEGORIES} active={category} onChange={setCategory} />
            <ErrorText>{error}</ErrorText>
            {!loading && (
              <Text style={s.count}>
                {visible.length} post{visible.length === 1 ? '' : 's'}
                {category ? ' in this category' : ''}
              </Text>
            )}
          </>
        }
        renderItem={({ item }) => (
          <PostCard
            post={item}
            showAuthor={false}
            onPress={() => navigation.navigate('InstructorPostDetails', { postId: item.postId })}
            trailing={
              <Pressable hitSlop={10} onPress={() => navigation.navigate('InstructorEditPost', { postId: item.postId })}>
                <Text style={s.edit}>Edit</Text>
              </Pressable>
            }
          />
        )}
        ListEmptyComponent={
          loading ? <Loading /> : (
            <Empty>
              {category ? 'Nothing in this category yet.' : 'You have not written any posts yet.'}
            </Empty>
          )
        }
        ListFooterComponent={
          <Button style={s.create} variant="secondary" onPress={() => navigation.navigate('InstructorCreatePost')}>
            Create Post
          </Button>
        }
      />
      <InstructorNav navigation={navigation} active="Dashboard" />
    </Screen>
  );
}

const s = StyleSheet.create({
  count: { ...type.caption, color: colors.inkFaint, marginBottom: spacing.sm },
  edit: { ...type.caption, fontWeight: '600', color: colors.primary },
  create: { marginTop: spacing.md },
});
