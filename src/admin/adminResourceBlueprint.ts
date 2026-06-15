export type AdminResourceName =
  | 'reports'
  | 'stories'
  | 'users'
  | 'communityPosts'
  | 'announcements'
  | 'supportMessages';

export interface AdminResourceBlueprint {
  name: AdminResourceName;
  label: string;
  primaryField: string;
  statusField?: string;
  defaultSort?: {
    field: string;
    order: 'ASC' | 'DESC';
  };
  searchableFields: string[];
}

export const ADMIN_RESOURCE_BLUEPRINTS: AdminResourceBlueprint[] = [
  {
    name: 'reports',
    label: 'Reports',
    primaryField: 'targetLabel',
    statusField: 'status',
    defaultSort: { field: 'createdAt', order: 'DESC' },
    searchableFields: ['targetLabel', 'targetId', 'reason', 'detail'],
  },
  {
    name: 'stories',
    label: 'Stories',
    primaryField: 'title',
    statusField: 'status',
    defaultSort: { field: 'created_at', order: 'DESC' },
    searchableFields: ['title', 'author_nickname', 'genre'],
  },
  {
    name: 'users',
    label: 'Users',
    primaryField: 'nickname',
    statusField: 'status',
    defaultSort: { field: 'created_at', order: 'DESC' },
    searchableFields: ['nickname', 'email', 'id'],
  },
  {
    name: 'communityPosts',
    label: 'Community Posts',
    primaryField: 'title',
    statusField: 'boardType',
    defaultSort: { field: 'createdAt', order: 'DESC' },
    searchableFields: ['title', 'authorName', 'tags'],
  },
  {
    name: 'announcements',
    label: 'Announcements',
    primaryField: 'title',
    statusField: 'status',
    defaultSort: { field: 'createdAt', order: 'DESC' },
    searchableFields: ['title', 'content'],
  },
  {
    name: 'supportMessages',
    label: 'Support Messages',
    primaryField: 'title',
    statusField: 'status',
    defaultSort: { field: 'created_at', order: 'DESC' },
    searchableFields: ['title', 'email', 'name', 'body'],
  },
];
