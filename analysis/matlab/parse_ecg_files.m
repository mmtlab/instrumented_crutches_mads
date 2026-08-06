function parsed_list = parse_ecg_files(folder)

    raw_list = ls(fullfile(folder,"*.csv"));
    raw_list = string(raw_list);

    % format string
    list = strrep(raw_list,".csv","");
    list = strrep(list,"_"," ");
    list = strrep(list,",","");

    list = split(list,"-");
    
    list_time = list(:,1);

    parsed_list.filename = raw_list;
    parsed_list.repetition = double(list(:,2));
    parsed_list.datetime = datetime(list_time,"InputFormat","d MMM yyyy HH mmss");
    
    parsed_list = struct2table(parsed_list);

end