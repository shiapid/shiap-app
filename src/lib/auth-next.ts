export function safeAuthNext(candidate:string|null|undefined){
 if(candidate==="/profile"||candidate==="/reset-password"||candidate==="/my-booking")return candidate;
 if(typeof candidate!=="string"||/[\\\u0000-\u001f]/.test(candidate))return "/profile";
 if(/^\/my-booking\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate))return candidate;
 if(/^\/partner(?:\/(?:claims|subscription|analytics|stay|places(?:\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:\/preview)?)?|billing(?:\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?))?$/i.test(candidate))return candidate;
 return "/profile";
}
