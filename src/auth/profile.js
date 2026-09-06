export function validateProfile(body) {
  if (!body || typeof body.name !== 'string') return null;
  const name = body.name.trim();
  if (name.length < 2 || name.length > 32) return null;
  const avatar = body.avatar;
  if (avatar !== null) {
    if (typeof avatar !== 'string' || avatar.length > 65536 ||
        !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(avatar)) return null;
    const bytes = Buffer.from(avatar.slice(23), 'base64');
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 ||
        bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return null;
  }
  return { name, avatar };
}
