exports.handler = async (event) => {
  const claims = event.response.claimsOverrideDetails || {};
  const username = event.userName;
  const phone = event.request.userAttributes.phone_number;

  event.response = {
    claimsOverrideDetails: {
      claimsToAddOrOverride: {
        "custom:username": username,
        "custom:phone": phone,
      }
    }
  };

  return event;
};
