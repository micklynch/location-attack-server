## Todo

[] Check if user exists
[] Check if user has any locations
[] Check if this location is in their existing locations

- If Yes
  [] Respond with User
- If No
  [] Respond with email verification
  [] Generate random token
  [] Store token in the users collection
  [] Send link with token to user's email address
  [] Create endpoint to receive token and validate that it exists - If Yes - return user
