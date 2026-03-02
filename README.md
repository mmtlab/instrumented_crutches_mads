
Check the mads.ini file configuration and run this command if you want to overwrite the existing mads.ini file
sudo cp instrumented_crutches_mads/template_mads_ini/mads.ini /usr/local/etc/

mads-broker
mads-filter status_handler
mads-filter coordinator -b
mads-filter hdf5_writer -b
mads-filter tip_loadcell -o side=left -b
mads-filter tip_loadcell -o side=right -b 



mads start failed: 'dict' object has no attribute 'encode'
