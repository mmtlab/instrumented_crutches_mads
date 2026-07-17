clear
close all
clc

% Configuration
idx = 22;

file_h5 = fullfile("..","..","web_server/data",compose("acq_%d.h5",idx));
[tip_left, tip_right] = tip(file_h5);

%%
t0 = double(tip_right.timestamp_unix_ns(1));
left_time = (double(tip_left.timestamp_unix_ns)-t0)*10^-9;
right_time = (double(tip_right.timestamp_unix_ns)-t0)*10^-9;

figure(1)
clf
plot(left_time,tip_left.force,'.')
hold on
plot(right_time,tip_right.force,'.')
grid on