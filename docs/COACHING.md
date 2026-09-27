# Trainer access

The account owner can assign `Member`, `Trainer`, or `Admin` in Settings → Admin → a user.
The existing `ADMIN_UIDS` environment setting remains an immutable admin override.

| Role | Access |
| --- | --- |
| Member | Own workouts and plans; choose trainers and revoke access; accept or decline each proposed plan. |
| Trainer | Member access, plus send a copy of a plan to a member who has granted access. The trainer cannot read or edit the member's state. |
| Admin | Existing instance management, including the existing global workout history view, plus trainer actions after the member grants plan access. |

The member grants access from Settings → Trainer access. This lets the trainer send plans,
but no plan is added automatically. The member reviews each proposal and chooses whether
to apply its weekly schedule. Accepted routines get new IDs, so existing routines and
completed workouts are retained. Revocation withdraws pending proposals and stops new
ones. Disabling or demoting a trainer also revokes grants.

Grants and pending proposals are stored in the existing server database document. There
is no new service or paid integration. Accepted and declined proposals retain only a
short summary. The member's completed workouts remain in their own state document.
