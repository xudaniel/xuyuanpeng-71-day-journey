import {sqliteTable,text,integer,uniqueIndex} from 'drizzle-orm/sqlite-core';
export const revisions=sqliteTable('revisions',{
 id:text('id').primaryKey(),stage:text('stage').notNull(),revision:integer('revision').notNull(),
 data:text('data').notNull(),actorId:text('actor_id').notNull(),actorEmail:text('actor_email').notNull(),
 createdAt:text('created_at').notNull(),action:text('action').notNull()
},t=>[uniqueIndex('revisions_stage_revision').on(t.stage,t.revision)]);
export const members=sqliteTable('members',{
 email:text('email').primaryKey(),addedBy:text('added_by').notNull(),createdAt:text('created_at').notNull()
});
