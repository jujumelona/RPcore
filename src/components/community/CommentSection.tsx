// src/components/community/CommentSection.tsx
// Mock comment section used for community UI prototyping.

import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, TextInput } from 'react-native';
import { MessageSquare, MoreHorizontal, Share2, ThumbsUp } from 'lucide-react-native';
import { Radius, Typography } from '../../constants/tokens';
import { useLanguageStore } from '../../store/languageStore';

interface Comment {
  id: string;
  user: { name: string; avatar?: string; isAuthor?: boolean };
  content: string;
  time: string;
  likes: number;
  replies?: Comment[];
  isBest?: boolean;
}

const MOCK_COMMENTS: Comment[] = [
  {
    id: '1',
    user: { name: 'ReaderOne', isAuthor: false },
    content: 'The tension in this chapter was great. The protagonist and the duke felt sharp and believable all the way through.',
    time: '2 hours ago',
    likes: 24,
    isBest: true,
    replies: [
      {
        id: '1-1',
        user: { name: 'Author', isAuthor: true },
        content: 'Thanks. I spent a lot of time making sure that scene stayed intense without breaking the mood.',
        time: '1 hour ago',
        likes: 12,
      },
    ],
  },
  {
    id: '2',
    user: { name: 'NightCoder', isAuthor: false },
    content: 'When is the next chapter coming? That ending felt like a trap in the best way.',
    time: '5 hours ago',
    likes: 8,
  },
];

export function CommentSection() {
  const [inputText, setInputText] = useState('');
  const t = useLanguageStore(state => state.t);

  return (
    <View style={s.root}>
      <Text style={s.sectionTitle}>{t?.comment ?? ''} ({MOCK_COMMENTS.length})</Text>

      <View style={s.inputBox}>
        <View style={s.avatarSmall} />
        <TextInput
          style={s.input}
          placeholder={t?.commentPlaceholder ?? ''}
          placeholderTextColor="#4A4A60"
          value={inputText}
          onChangeText={setInputText}
          multiline
        />
        <TouchableOpacity style={s.sendBtn} disabled={!inputText.trim()}>
          <Text style={[s.sendBtnTxt, !inputText.trim() && s.sendBtnDis]}>{t?.send ?? ''}</Text>
        </TouchableOpacity>
      </View>

      <View style={s.list}>
        {MOCK_COMMENTS.map(comment => (
          <CommentItem key={comment.id} comment={comment} />
        ))}
      </View>
    </View>
  );
}

function CommentItem({ comment, isReply = false }: { comment: Comment; isReply?: boolean }) {
  const [liked, setLiked] = useState(false);

  return (
    <View style={[s.item, isReply && s.itemReply]}>
      <View style={s.itemMain}>
        <View style={s.avatarWrap}>
          {comment.user.avatar ? (
            <Image source={{ uri: comment.user.avatar }} style={s.avatar} />
          ) : (
            <View style={[s.avatar, s.avatarPlaceholder]}>
              <Text style={s.avatarTxt}>{comment.user.name[0]}</Text>
            </View>
          )}
        </View>

        <View style={s.contentCol}>
          <View style={s.nameRow}>
            <View style={s.nameGroup}>
              <Text style={s.name}>{comment.user.name}</Text>
              {comment.user.isAuthor ? (
                <View style={s.authorBadge}>
                  <Text style={s.authorBadgeTxt}>AUTHOR</Text>
                </View>
              ) : null}
              {comment.isBest ? (
                <View style={s.bestBadge}>
                  <Text style={s.bestBadgeTxt}>BEST</Text>
                </View>
              ) : null}
            </View>
            <TouchableOpacity>
              <MoreHorizontal size={14} color="#4A4A60" />
            </TouchableOpacity>
          </View>

          <Text style={s.content}>{comment.content}</Text>

          <View style={s.footer}>
            <Text style={s.time}>{comment.time}</Text>
            <View style={s.actions}>
              <TouchableOpacity style={s.actionBtn} onPress={() => setLiked(!liked)}>
                <ThumbsUp size={12} color={liked ? '#D4A853' : '#4A4A60'} fill={liked ? '#D4A853' : 'transparent'} />
                <Text style={[s.actionTxt, liked && s.actionTxtActive]}>{comment.likes + (liked ? 1 : 0)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.actionBtn}>
                <MessageSquare size={12} color="#4A4A60" />
                <Text style={s.actionTxt}>{comment.replies?.length ?? 0}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.actionBtn}>
                <Share2 size={12} color="#4A4A60" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      {comment.replies?.map(reply => (
        <CommentItem key={reply.id} comment={reply} isReply />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  root: { paddingHorizontal: 20, paddingTop: 30, paddingBottom: 60, borderTopWidth: 1, borderTopColor: '#181820' },
  sectionTitle: { fontSize: 16, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5', marginBottom: 20 },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0C0C14',
    borderRadius: Radius.lg,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1E1E2A',
    marginBottom: 24,
  },
  avatarSmall: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#1E1E2A', marginRight: 12 },
  input: { flex: 1, color: '#F0F0F5', fontSize: 13, fontFamily: Typography.fontFamily.regular, maxHeight: 80 },
  sendBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(212,168,83,0.1)' },
  sendBtnTxt: { fontSize: 13, color: '#D4A853', fontFamily: Typography.fontFamily.bold },
  sendBtnDis: { color: '#4A4A60' },
  list: { gap: 24 },
  item: { gap: 12 },
  itemReply: { marginLeft: 44, marginTop: 16, borderLeftWidth: 1, borderLeftColor: '#1E1E2A', paddingLeft: 12 },
  itemMain: { flexDirection: 'row' },
  avatarWrap: { marginRight: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarPlaceholder: { backgroundColor: '#181820', alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#8A8A9E', fontWeight: 'bold' },
  contentCol: { flex: 1, gap: 6 },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nameGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 13, fontFamily: Typography.fontFamily.bold, color: '#F0F0F5' },
  authorBadge: { backgroundColor: 'rgba(212,168,83,0.1)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, borderWidth: 0.5, borderColor: 'rgba(212,168,83,0.3)' },
  authorBadgeTxt: { fontSize: 9, color: '#D4A853', fontFamily: Typography.fontFamily.bold },
  bestBadge: { backgroundColor: 'rgba(74,222,128,0.1)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, borderWidth: 0.5, borderColor: 'rgba(74,222,128,0.3)' },
  bestBadgeTxt: { fontSize: 9, color: '#4ADE80', fontFamily: Typography.fontFamily.bold },
  content: { fontSize: 14, color: '#C6CAD8', fontFamily: Typography.fontFamily.regular, lineHeight: 20 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  time: { fontSize: 11, color: '#4A4A60' },
  actions: { flexDirection: 'row', gap: 16 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionTxt: { fontSize: 11, color: '#4A4A60', fontFamily: Typography.fontFamily.medium },
  actionTxtActive: { color: '#D4A853' },
});
