# KidsGuard Proguard Rules
-keepattributes *Annotation*
-keepclassmembers class * {
    @org.json.* <fields>;
    @org.json.* <methods>;
}
-keep class com.kidsguard.child.data.model.** { *; }
