# Database

FairShare uses top-level Firestore collections.

## users

```json
{
  "id": "user-id",
  "email": "alice@example.com",
  "displayName": "Alice",
  "passwordHash": "bcrypt hash",
  "createdAt": "2026-06-07T00:00:00.000Z"
}
```

## groups

```json
{
  "id": "group-id",
  "ownerId": "user-id",
  "name": "Vegas Trip",
  "members": [
    { "userId": "user-id", "name": "Alice", "email": "alice@example.com" }
  ],
  "createdAt": "2026-06-07T00:00:00.000Z",
  "updatedAt": "2026-06-07T00:00:00.000Z"
}
```

## expenses

```json
{
  "id": "expense-id",
  "groupId": "group-id",
  "createdBy": "user-id",
  "title": "Dinner at ABC Restaurant",
  "merchant": "ABC Restaurant",
  "category": "Food",
  "subtotal": 64,
  "tax": 5.2,
  "tip": 12,
  "total": 81.2,
  "splitMode": "itemized",
  "status": "pending",
  "imageUrlOrImageName": "receipt.jpg",
  "rawReceiptText": "receipt text",
  "aiConfidenceNotes": ["Tip amount may need manual verification."],
  "items": [
    { "id": "item-id", "name": "Steak", "price": 38, "quantity": 1, "assignedTo": ["user-id"] }
  ],
  "approvalStatus": {
    "user-id": "pending"
  }
}
```

Valid expense statuses are `draft`, `pending`, `approved`, `disputed`, and `settled`. Valid approval statuses are `pending`, `approved`, and `disputed`.

## comments

```json
{
  "id": "comment-id",
  "expenseId": "expense-id",
  "userId": "user-id",
  "userName": "Alice",
  "body": "Please remove me from fries.",
  "createdAt": "2026-06-07T00:00:00.000Z"
}
```

## notifications

```json
{
  "id": "notification-id",
  "userId": "user-id",
  "type": "expense_added",
  "message": "You were added to a new expense: Dinner at ABC Restaurant.",
  "relatedExpenseId": "expense-id",
  "relatedGroupId": "group-id",
  "read": false,
  "createdAt": "2026-06-07T00:00:00.000Z"
}
```

## invitations

```json
{
  "id": "invitation-id",
  "groupId": "group-id",
  "groupName": "Vegas Trip",
  "invitedUserId": "user-id",
  "invitedUserEmail": "alice@example.com",
  "invitedByUserId": "owner-user-id",
  "status": "pending",
  "createdAt": "2026-06-07T00:00:00.000Z",
  "updatedAt": "2026-06-07T00:00:00.000Z"
}
```

Valid invitation statuses are `pending`, `accepted`, and `declined`. A user is added to `groups.members` only after accepting an invitation.

## Relationships

Groups own expenses by `groupId`. Invitations connect registered users to groups before membership. Expenses reference group members in `items[].assignedTo` and `approvalStatus`. Comments and notifications reference expenses by `expenseId` or `relatedExpenseId`.
