import { useState, useEffect, useCallback, useMemo } from 'react';
import { Text, FlatList, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext.js';
import viewInstructorPostsController from '../control/ViewInstructorPostsController.js';
import { POST_CATEGORIES } from '../entities/InstructorPost.js';
import { Screen, Header, Field, BottomNav } from '../components/AppUI.js';
import {
  InstructorNav, CategoryChips, PostCard, Loading, Empty, ErrorText, instructorStyles,
} from '../components/InstructorUI.js';
import { colors } from '../theme/colors.js';
import { type, spacing } from '../theme/typography.js';

const PLACEHOLDER_POSTS = [
  {
    postId: 'preview-recovery',
    title: 'Why recovery days improve your running',
    excerpt: 'Rest is part of training. Learn how easy days help your body adapt and reduce fatigue.',
    content: 'Recovery days allow your muscles, joints, and nervous system to adapt to training. Keep easy days genuinely easy, prioritise sleep and hydration, and avoid stacking hard sessions when fatigue is high. If soreness changes your running form or persists, reduce your training load and recover before increasing intensity again.',
    category: 'recovery',
    readMinutes: 4,
    authorName: 'Coach Amelia Tan',
    authorVerified: true,
    createdAt: '2026-09-28T09:00:00+08:00',
    preview: true,
  },
  {
    postId: 'preview-5k',
    title: 'Three simple ways to improve your 5K pace',
    excerpt: 'Use an easy run, one quality session, and a longer aerobic run to build speed without overcomplicating training.',
    content: 'A simple 5K week can include mostly easy running, one controlled faster session, and one slightly longer aerobic run. Increase volume gradually and keep hard sessions separated by recovery. Consistency across several weeks matters more than one very hard workout.',
    category: 'training',
    readMinutes: 5,
    authorName: 'Coach Daniel Lim',
    authorVerified: true,
    createdAt: '2026-09-26T18:30:00+08:00',
    preview: true,
  },
  {
    postId: 'preview-hydration',
    title: 'Running in Singapore heat: hydration basics',
    excerpt: 'Plan around heat and humidity, drink appropriately, and recognise when you should slow down.',
    content: 'Hot and humid conditions can make the same running pace feel much harder. Run earlier or later when possible, start well hydrated, and reduce intensity when conditions are difficult. Stop if you develop concerning symptoms such as dizziness, confusion, chest pain, or severe weakness.',
    category: 'wellness',
    readMinutes: 3,
    authorName: 'Coach Sarah Lee',
    authorVerified: true,
    createdAt: '2026-09-24T07:15:00+08:00',
    preview: true,
  },
];

function matches(post, search, category) {
  const categoryOk = !category || post.category === category;
  const needle = search.trim().toLowerCase();
  const searchOk = !needle || [post.title, post.excerpt, post.authorName].some((value) => String(value || '').toLowerCase().includes(needle));
  return categoryOk && searchOk;
}

export default function InstructorBoardScreen({ navigation }) {
  const { user } = useAuth();
  const isInstructor = user?.role === 'instructor';

  const [category, setCategory] = useState(null);
  const [search, setSearch] = useState('');
  const [posts, setPosts] = useState([]);
  const [categories, setCategories] = useState(POST_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const result = await viewInstructorPostsController({
      category: category || undefined,
      search: search.trim() || undefined,
      limit: 50,
    });
    if (result.success) {
      setPosts(result.data.posts || []);
      if (result.data.categories) setCategories(result.data.categories);
      setError('');
    } else {
      setError(result.message);
    }
    setLoading(false);
  }, [category, search]);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
  }, [load]);

  const visiblePosts = useMemo(() => {
    if (posts.length) return posts;
    return PLACEHOLDER_POSTS.filter((post) => matches(post, search, category));
  }, [posts, search, category]);

  return (
    <Screen>
      <Header title="Instructor Board" navigation={navigation} />
      <FlatList
        data={visiblePosts}
        keyExtractor={(item) => String(item.postId)}
        contentContainerStyle={instructorStyles.content}
        ListHeaderComponent={
          <>
            <Field label="Search" value={search} onChangeText={setSearch} placeholder="Search posts" />
            <CategoryChips categories={categories} active={category} onChange={setCategory} />
            <ErrorText>{error}</ErrorText>
            {!loading && visiblePosts.length > 0 && (
              <Text style={s.count}>{visiblePosts.length} post{visiblePosts.length === 1 ? '' : 's'}</Text>
            )}
          </>
        }
        renderItem={({ item }) => (
          <PostCard
            post={item}
            onPress={() => navigation.navigate('InstructorPostDetails', item.preview ? { previewPost: item } : { postId: item.postId })}
          />
        )}
        ListEmptyComponent={loading ? <Loading /> : <Empty>No posts match that filter.</Empty>}
      />
      {isInstructor ? <InstructorNav navigation={navigation} active="Board" /> : <BottomNav navigation={navigation} />}
    </Screen>
  );
}

const s = StyleSheet.create({
  count: { ...type.caption, color: colors.inkFaint, marginBottom: spacing.sm },
});
