#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(PreviewActivityModule, NSObject)

RCT_EXTERN_METHOD(startActivity:(NSString *)projectName
                  operationType:(NSString *)operationType
                  remainingSeconds:(NSInteger)remainingSeconds
                  currentStep:(NSString *)currentStep
                  progress:(double)progress
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(updateActivity:(NSInteger)remainingSeconds
                  currentStep:(NSString *)currentStep
                  progress:(double)progress
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(endActivity:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(endActivityWithSuccess:(NSString *)projectName
                  message:(NSString *)message
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(requestNotificationPermission:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(sendLocalNotification:(NSString *)title
                  body:(NSString *)body
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
