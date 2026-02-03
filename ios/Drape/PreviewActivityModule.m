#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(PreviewActivityModule, NSObject)

// Live Activity methods
RCT_EXTERN_METHOD(startActivity:(NSString *)projectName
                  operationType:(NSString *)operationType
                  remainingSeconds:(int)remainingSeconds
                  currentStep:(NSString *)currentStep
                  progress:(double)progress
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

RCT_EXTERN_METHOD(updateActivity:(int)remainingSeconds
                  currentStep:(NSString *)currentStep
                  progress:(double)progress
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

RCT_EXTERN_METHOD(endActivity:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

RCT_EXTERN_METHOD(endActivityWithSuccess:(NSString *)projectName
                  message:(NSString *)message
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

// Notification methods
RCT_EXTERN_METHOD(requestNotificationPermission:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

RCT_EXTERN_METHOD(sendLocalNotification:(NSString *)title
                  body:(NSString *)body
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

@end
