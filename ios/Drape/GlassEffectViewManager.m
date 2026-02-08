#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(GlassEffectModule, NSObject)
RCT_EXTERN_METHOD(apply:(NSString *)nativeID cornerRadius:(CGFloat)cornerRadius)
RCT_EXTERN_METHOD(applyWithCallback:(NSString *)nativeID
                  cornerRadius:(CGFloat)cornerRadius
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(remove:(NSString *)nativeID)
RCT_EXTERN_METHOD(removeAll)
@end
