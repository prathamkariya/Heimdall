from typing import List, Callable, Any
from fastapi import Depends, HTTPException, status
from app.models import User
from app.dependencies import get_current_user

def require_role(allowed_roles: List[str]) -> Callable:
    """
    Returns a FastAPI dependency that verifies the current user has one of the allowed roles.
    """
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operation not permitted. Required role(s): {', '.join(allowed_roles)}",
            )
        return current_user
    return role_checker

# Common pre-configured role dependencies
require_analyst = require_role(["analyst", "admin"])
require_admin = require_role(["admin"])

def verify_ownership(resource: Any, current_user: User, owner_field: str = "user_id") -> None:
    """
    Centralized check to ensure a user owns a specific resource.
    Raises 403 if the user is not the owner (and not an admin).
    """
    # Admins can bypass ownership checks
    if current_user.role == "admin":
        return
        
    resource_owner_id = getattr(resource, owner_field, None)
    if resource_owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this resource."
        )

def verify_case_access(case: Any, current_user: User) -> None:
    """
    Check if user has access to a Case.
    Allowed: admins, analysts, the case creator, or the assigned user.
    """
    if current_user.role in ["admin", "analyst"]:
        return
    if case.created_by_user_id == current_user.id or case.assigned_to_user_id == current_user.id:
        return
        
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You do not have permission to access this case."
    )
